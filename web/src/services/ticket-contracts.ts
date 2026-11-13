// Contratos de leitura validados na borda HTTP; os tipos da interface vêm destes schemas.
import { z } from "zod";

const identifier = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const instant = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();
const namedCode = z.object({ code: z.string(), name: z.string() });
const person = z
  .object({ id: identifier, name: z.string().nullable() })
  .nullable();
const technicalNote = z.object({
  id: identifier,
  content: z.string(),
  created_at: instant,
  author: person,
});
const metadata = z.object({
  request_id: identifier,
  generated_at: instant,
  time_zone: z.literal("America/Sao_Paulo"),
  period_basis: z.enum(["created_at", "resolved_at"]).nullable(),
});
const sourceQuality = z.object({
  received: count,
  rejected: count,
  pending: count,
  linked: count,
  last_received_at: instant.nullable(),
  mode: z.enum(["empty", "demo", "operational", "mixed"]),
});
const ticket = z.object({
  id: identifier,
  title: z.string(),
  description: z.string(),
  status: namedCode,
  type: z.object({ id: identifier, code: z.string(), name: z.string() }),
  priority: namedCode,
  assignee: person,
  requester: z.object({
    id: identifier,
    name: z.string(),
    department: z.string().nullable(),
  }),
  created_at: instant,
  updated_at: instant,
  resolved_at: instant.nullable(),
  source: z.object({ system: z.string(), external_id: z.string() }).nullable(),
  provenance: z.object({
    contract_version: z.literal("1.0").nullable(),
    exported_at: instant.nullable(),
    title_is_derived: z.boolean(),
    history_coverage: z.enum(["complete", "partial", "unavailable"]),
    technical_notes_coverage: z.enum(["complete", "partial", "unavailable"]),
  }).optional(),
  latest_technical_note: technicalNote.nullable(),
});

export const summaryContract = z.object({
  summary: z.object({
    total: count,
    open: count,
    in_progress: count,
    waiting: count,
    resolved: count,
    average_resolution_seconds: z.number().nonnegative().nullable(),
    resolution_rate: z.number().min(0).max(100).nullable(),
  }),
  meta: metadata.extend({ source_quality: sourceQuality }),
});
export const periodsContract = z.object({
  periods: z.array(z.object({ period_start: z.iso.date(), tickets: count })),
  group_by: z.enum(["day", "week", "month"]),
  meta: metadata,
});
export const statusesContract = z.object({
  statuses: z.array(namedCode.extend({ tickets: count })),
  meta: metadata,
});
export const rankingContract = z.object({
  types: z.array(
    z.object({
      id: identifier,
      code: z.string(),
      name: z.string(),
      tickets: count,
    }),
  ),
  limit: z.number().int().min(1).max(20),
  meta: metadata,
});
export const ticketsContract = z.object({
  tickets: z.array(ticket),
  pagination: z.object({
    page: z.number().int().min(1),
    page_size: z.number().int().min(1).max(100),
    total: count,
    total_pages: count,
  }),
  sort_by: z.enum(["created_at", "updated_at", "resolved_at", "priority"]),
  sort_order: z.enum(["asc", "desc"]),
  meta: metadata,
});
export const detailContract = z.object({
  ticket,
  technical_notes: z.array(technicalNote),
  history: z.array(
    z.object({
      id: identifier,
      event_type: z.string(),
      sequence: z.number().int().positive().nullable().optional(),
      occurred_at: instant,
      author: person,
      previous_value: z.unknown(),
      new_value: z.unknown(),
    }),
  ),
  meta: metadata,
});
export const optionsContract = z.object({
  options: z.object({
    statuses: z.array(namedCode),
    types: z.array(
      z.object({
        id: identifier,
        code: z.string(),
        name: z.string(),
        active: z.boolean(),
      }),
    ),
    priorities: z.array(
      namedCode.extend({ severity: z.number().int().min(1).max(4) }),
    ),
    assignees: z.array(
      z.object({ id: identifier, name: z.string(), active: z.boolean() }),
    ),
  }),
  meta: metadata,
});

export type DashboardSummary = z.infer<typeof summaryContract>;
export type TicketPeriods = z.infer<typeof periodsContract>;
export type TicketStatuses = z.infer<typeof statusesContract>;
export type TicketRanking = z.infer<typeof rankingContract>;
export type TicketPage = z.infer<typeof ticketsContract>;
export type TicketDetail = z.infer<typeof detailContract>;
export type FilterOptions = z.infer<typeof optionsContract>["options"];
export type Ticket = z.infer<typeof ticket>;
export type GroupBy = TicketPeriods["group_by"];
export type SortBy = TicketPage["sort_by"];
export type SortOrder = TicketPage["sort_order"];
export interface TicketFilters {
  start_date: string;
  end_date: string;
  status: string;
  type_id: string;
  priority: string;
  assignee_id: string;
}
