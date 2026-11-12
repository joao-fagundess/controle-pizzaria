package com.pfc.thindesk.analytics;

import java.security.Principal;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// Expõe a captura complementar somente no ambiente local explicitamente habilitado.
@RestController
@RequestMapping("/api/v1/analytics")
@ConditionalOnProperty(name = "thindesk.analytics.enabled", havingValue = "true")
public class AnalyticsController {
    private final AnalyticsService service;
    public AnalyticsController(AnalyticsService service) { this.service = service; }

    @PostMapping("/catalog/{kind}")
    public Object register(@PathVariable("kind") String kind, @RequestBody String body) {
        return service.register(kind, body);
    }

    @PostMapping("/tickets")
    public ResponseEntity<?> create(@RequestBody String body, Principal principal) {
        return ResponseEntity.status(201).body(service.create(body, principal.getName()));
    }

    @PutMapping("/tickets/{id}")
    public Object update(@PathVariable("id") String id, @RequestBody String body, Principal principal) {
        return service.update(id, body, principal.getName(), false);
    }

    @PostMapping("/tickets/{id}/notes")
    public Object note(@PathVariable("id") String id, @RequestBody String body, Principal principal) {
        return service.update(id, body, principal.getName(), true);
    }

    @GetMapping("/tickets/{id}")
    public Object get(@PathVariable("id") String id) { return service.get(id); }

    @GetMapping(value = "/tickets/export", produces = "application/json")
    public ResponseEntity<byte[]> export() { return service.export(); }
}
