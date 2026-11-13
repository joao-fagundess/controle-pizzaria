package com.pfc.thindesk.analytics;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mongodb.MongoWriteException;
import com.mongodb.client.MongoCollection;
import java.time.Instant;
import java.util.*;
import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import static com.mongodb.client.model.Filters.*;

// Mantém snapshot, projeção legada e fatos no mesmo documento, com revisão otimista.
// O catálogo desta versão é imutável; datas e autores vêm da operação autenticada na origem.
@Service
public class AnalyticsService {
    private static final int LIMIT = 5 * 1024 * 1024;
    private static final Set<String> CORE = Set.of("title", "description", "priority", "type_external_id", "requester_external_id", "assignee_external_id");
    private static final Set<String> STATUSES = Set.of("open", "in_progress", "waiting", "resolved", "closed");
    private static final Set<String> PRIORITIES = Set.of("low", "normal", "high", "urgent");
    private final MongoCollection<Document> tickets;
    private final MongoCollection<Document> catalog;
    private final ObjectMapper json = new ObjectMapper().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);

    public AnalyticsService(MongoTemplate mongo) {
        tickets = mongo.getCollection("chamados");
        catalog = mongo.getCollection("analytics_catalog");
    }

    private ResponseStatusException failure(HttpStatus status, String message) {
        return new ResponseStatusException(status, message);
    }
    private void require(boolean condition, String message) {
        if (!condition) throw failure(HttpStatus.BAD_REQUEST, message);
    }
    private Document parse(String raw) {
        require(raw.length() <= 1024 * 1024, "Requisição excede 1 MiB.");
        try {
            require(json.readTree(raw).isObject(), "Informe um objeto JSON.");
            return Document.parse(json.writeValueAsString(json.readValue(raw, Map.class)));
        } catch (ResponseStatusException exception) { throw exception; }
        catch (Exception exception) { throw failure(HttpStatus.BAD_REQUEST, "JSON inválido."); }
    }
    private void fields(Document value, Set<String> required, Set<String> optional) {
        require(value.keySet().containsAll(required), "Campos obrigatórios ausentes.");
        require(value.keySet().stream().allMatch(key -> required.contains(key) || optional.contains(key)), "Campo não permitido.");
    }
    private boolean space(int value) {
        return Character.isWhitespace(value) || Character.isSpaceChar(value) || value == 0xFEFF;
    }
    private String text(Object value) {
        require(value instanceof String, "Texto obrigatório.");
        String result = (String) value;
        require(result.codePoints().anyMatch(code -> !space(code)), "Texto vazio.");
        require(result.codePoints().noneMatch(code -> code < 32 && code != 9 && code != 10 && code != 13 || code == 127 || code >= 0xD800 && code <= 0xDFFF), "Caractere inválido.");
        return result;
    }
    private String identity(Object value) {
        String result = text(value);
        require(result.codePointCount(0, result.length()) <= 256 && result.codePoints().noneMatch(code -> space(code) || code < 32), "Identificador inválido.");
        return result;
    }
    private String choice(Object value, Set<String> choices) {
        require(value instanceof String && choices.contains(value), "Código inválido.");
        return (String) value;
    }
    private Document copy(Document value) { return Document.parse(value.toJson()); }
    private Document reference(String kind, Object id) {
        String externalId = identity(id);
        Document record = catalog.find(eq("_id", kind + ":" + externalId)).first();
        if (record == null) throw failure(HttpStatus.CONFLICT, "Cadastre a identidade de origem antes de utilizá-la.");
        return copy(record.get("value", Document.class));
    }
    private Document actor(String username) {
        Document actor = reference("staff", username);
        if (!Boolean.TRUE.equals(actor.get("active"))) throw failure(HttpStatus.CONFLICT, "Autor inativo.");
        return actor;
    }
    public Document register(String kind, String raw) {
        require(Set.of("types", "requesters", "staff").contains(kind), "Catálogo inválido.");
        Document value = parse(raw);
        fields(value, kind.equals("staff") ? Set.of("external_id", "name", "role", "active") : Set.of("external_id", "name"), kind.equals("requesters") ? Set.of("department") : Set.of());
        identity(value.get("external_id")); text(value.get("name"));
        if (value.get("department") != null) text(value.get("department"));
        if (kind.equals("staff")) {
            choice(value.get("role"), Set.of("technician", "supervisor"));
            require(value.get("active") instanceof Boolean, "Situação ativa obrigatória.");
        }
        String key = kind + ":" + value.getString("external_id");
        try { catalog.insertOne(new Document("_id", key).append("value", value)); }
        catch (MongoWriteException exception) {
            if (exception.getError().getCode() != 11000) throw exception;
            if (!catalog.find(eq("_id", key)).first().get("value").equals(value))
                throw failure(HttpStatus.CONFLICT, "Identidade já cadastrada com outros metadados; catálogo imutável nesta versão.");
        }
        return value;
    }
    private Document core(Document body) {
        String title = text(body.get("title"));
        require(title.codePointCount(0, title.length()) <= 240, "Título excede 240 caracteres.");
        Document assigned = body.get("assignee_external_id") == null ? null : reference("staff", body.get("assignee_external_id"));
        if (assigned != null) require("technician".equals(assigned.get("role")) && Boolean.TRUE.equals(assigned.get("active")), "Atribuição exige técnico ativo.");
        return new Document("title", title).append("title_is_derived", false).append("description", text(body.get("description")))
            .append("priority", choice(body.get("priority"), PRIORITIES)).append("type", reference("types", body.get("type_external_id")))
            .append("requester", reference("requesters", body.get("requester_external_id"))).append("assignee", assigned);
    }
    private Object refId(Document value, String key) {
        return value.get(key) == null ? null : value.get(key, Document.class).getString("external_id");
    }
    private Document initial(Document ticket) {
        return new Document("status", ticket.get("status")).append("priority", ticket.get("priority"))
            .append("type_external_id", refId(ticket, "type")).append("assignee_external_id", refId(ticket, "assignee"));
    }
    private Document event(int sequence, String type, Document actor, String now, Object before, Object after) {
        return new Document("external_id", UUID.randomUUID().toString()).append("sequence", sequence).append("event_type", type)
            .append("author", actor).append("occurred_at", now).append("previous_value", before).append("new_value", after);
    }
    private Document projection(Document ticket, long revision) {
        String status = switch (ticket.getString("status")) { case "open" -> "ABERTO"; case "resolved", "closed" -> "CONCLUIDO"; default -> "EM_ANDAMENTO"; };
        return new Document("_id", ticket.getString("external_id")).append("descricao", ticket.get("description")).append("status", status)
            .append("tipo", ticket.get("type", Document.class).get("name")).append("usuario", ticket.get("requester", Document.class).get("name"))
            .append("tecnico", ticket.get("assignee") == null ? null : ticket.get("assignee", Document.class).get("name"))
            .append("_analytics", new Document("revision", revision).append("ticket", ticket));
    }
    private Document receipt(Document ticket, long revision) {
        return new Document("revision", revision).append("ticket", ticket);
    }
    public Document get(String id) {
        identity(id);
        Document stored = tickets.find(and(eq("_id", id), exists("_analytics"))).first();
        if (stored == null) throw failure(HttpStatus.NOT_FOUND, "Chamado sem captura complementar.");
        return stored.get("_analytics", Document.class);
    }
    public Document create(String raw, String username) {
        Document body = parse(raw); fields(body, CORE, Set.of());
        Document ticket = core(body); Document actor = actor(username);
        String now = Instant.now().toString();
        ticket.append("external_id", UUID.randomUUID().toString()).append("status", "open")
            .append("created_at", now).append("updated_at", now).append("resolved_at", null)
            .append("history", new Document("coverage", "complete").append("items", new ArrayList<>(List.of(event(1, "created", actor, now, null, initial(ticket))))))
            .append("technical_notes", new Document("coverage", "complete").append("items", new ArrayList<Document>()));
        require(projection(ticket, 1).toJson().getBytes(java.nio.charset.StandardCharsets.UTF_8).length < LIMIT - 1024, "Chamado excede o limite de exportação.");
        tickets.insertOne(projection(ticket, 1));
        return receipt(ticket, 1);
    }
    public Document update(String id, String raw, String username, boolean note) {
        identity(id); Document body = parse(raw);
        Set<String> required = new HashSet<>(note ? Set.of("content") : CORE);
        required.add("expected_revision"); if (!note) required.add("status");
        fields(body, required, Set.of());
        Object expected = body.get("expected_revision");
        require(expected instanceof Integer || expected instanceof Long, "Revisão inteira obrigatória.");
        long revision = ((Number) expected).longValue(); require(revision > 0 && revision < Long.MAX_VALUE, "Revisão inválida.");
        Document stored = tickets.find(and(eq("_id", id), exists("_analytics"))).first();
        if (stored == null) throw failure(HttpStatus.NOT_FOUND, "Chamado sem captura complementar.");
        Document metadata = stored.get("_analytics", Document.class);
        if (((Number) metadata.get("revision")).longValue() != revision) throw failure(HttpStatus.CONFLICT, "Revisão desatualizada.");
        Document ticket = copy(metadata.get("ticket", Document.class)); Document author = actor(username);
        Instant clock = Instant.now();
        if (clock.isBefore(Instant.parse(ticket.getString("updated_at")))) throw failure(HttpStatus.SERVICE_UNAVAILABLE, "Relógio da origem regrediu.");
        String now = clock.toString();
        if (note) {
            ticket.get("technical_notes", Document.class).getList("items", Document.class).add(new Document("external_id", UUID.randomUUID().toString())
                .append("author", author).append("content", text(body.get("content"))).append("created_at", now));
        } else {
            Document changed = core(body).append("status", choice(body.get("status"), STATUSES));
            if (changed.entrySet().stream().allMatch(entry -> Objects.equals(ticket.get(entry.getKey()), entry.getValue()))) return receipt(ticket, revision);
            Document before = initial(ticket); ticket.putAll(changed); Document after = initial(ticket);
            List<Document> events = ticket.get("history", Document.class).getList("items", Document.class);
            for (String field : List.of("status", "priority", "type_external_id", "assignee_external_id")) {
                if (!Objects.equals(before.get(field), after.get(field))) {
                    String type = field.replace("_external_id", "") + "_changed";
                    events.add(event(events.size() + 1, type, author, now, before.get(field), after.get(field)));
                }
            }
            boolean resolved = Set.of("resolved", "closed").contains(ticket.getString("status"));
            ticket.put("resolved_at", resolved ? ticket.get("resolved_at") == null ? now : ticket.get("resolved_at") : null);
        }
        ticket.put("updated_at", now);
        // MongoDB limita o documento a 16 MiB; a captura para antes para nunca gerar um export individual impossível.
        require(projection(ticket, revision + 1).toJson().getBytes(java.nio.charset.StandardCharsets.UTF_8).length < LIMIT - 1024, "Chamado excede o limite de exportação.");
        long matched = tickets.replaceOne(and(eq("_id", id), eq("_analytics.revision", revision)), projection(ticket, revision + 1)).getMatchedCount();
        if (matched != 1) throw failure(HttpStatus.CONFLICT, "Revisão concorrente; releia antes de tentar novamente.");
        return receipt(ticket, revision + 1);
    }
    public ResponseEntity<byte[]> export() {
        List<Document> result = new ArrayList<>(); int excluded = 0; long estimatedBytes = 0;
        try (var cursor = tickets.find().sort(new Document("_id", 1)).iterator()) {
            while (cursor.hasNext()) {
                Document source = cursor.next();
                if (source.get("_analytics") == null) excluded++;
                else {
                    Document ticket = source.get("_analytics", Document.class).get("ticket", Document.class);
                    try { estimatedBytes += json.writeValueAsBytes(ticket).length + 1; }
                    catch (Exception exception) { throw failure(HttpStatus.INTERNAL_SERVER_ERROR, "Falha ao serializar export."); }
                    if (estimatedBytes > LIMIT) throw failure(HttpStatus.PAYLOAD_TOO_LARGE, "Export excede 5 MiB; nenhum dado foi truncado.");
                    result.add(ticket);
                }
            }
        }
        Instant now = Instant.now();
        if (result.stream().anyMatch(ticket -> Instant.parse(ticket.getString("updated_at")).isAfter(now)))
            throw failure(HttpStatus.SERVICE_UNAVAILABLE, "Relógio da origem regrediu.");
        Document envelope = new Document("contract_version", "1.0").append("source_system", "thindesk").append("exported_at", now.toString()).append("tickets", result);
        byte[] bytes;
        try { bytes = json.writeValueAsBytes(envelope); }
        catch (Exception exception) { throw failure(HttpStatus.INTERNAL_SERVER_ERROR, "Falha ao serializar export."); }
        if (bytes.length > LIMIT) throw failure(HttpStatus.PAYLOAD_TOO_LARGE, "Export excede 5 MiB; nenhum dado foi truncado.");
        return ResponseEntity.ok().header("Content-Type", "application/json").header("Cache-Control", "no-store")
            .header("X-Thindesk-Excluded-Legacy", String.valueOf(excluded)).header("X-Thindesk-Exported", String.valueOf(result.size())).body(bytes);
    }
}
