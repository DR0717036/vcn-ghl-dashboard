// Typed READ-ONLY wrappers around the GHL endpoints this dashboard uses.
// Every function here is a GET. Field names and Version values were verified
// against HighLevel's official OpenAPI specs (apps/*.json in
// github.com/GoHighLevel/highlevel-api-docs) on 2026-10-11.

import { getEnv } from "@/lib/env";
import { ghlGet, ghlGetStream, type GhlResult } from "@/lib/ghl/http";

// ---- response shapes (only the fields we rely on) --------------------------

export interface GhlLocation {
  id: string;
  name?: string;
  timezone?: string;
  country?: string;
  companyId?: string;
}

export interface GhlStage {
  id: string;
  name: string;
  position?: number;
}

export interface GhlPipeline {
  id: string;
  name: string;
  stages: GhlStage[];
  dateAdded?: string;
  dateUpdated?: string;
}

export interface GhlUser {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  deleted?: boolean;
  roles?: { type?: string; role?: string; locationIds?: string[] };
}

export interface GhlTag {
  id: string;
  name: string;
}

export interface GhlCustomField {
  id: string;
  name: string;
  fieldKey?: string;
  dataType?: string;
  model?: string;
  picklistOptions?: unknown;
}

export interface GhlCalendar {
  id: string;
  name: string;
  isActive?: boolean;
  calendarType?: string;
  eventType?: string;
  groupId?: string;
  teamMembers?: { userId: string }[];
}

export interface GhlCalendarEvent {
  id: string;
  calendarId?: string;
  contactId?: string;
  appointmentStatus?: string;
  assignedUserId?: string;
  startTime?: string;
  endTime?: string;
  dateAdded?: string;
  dateUpdated?: string;
  // Live account (2026-10-11): { source: "mobile_app", userId: "..." }
  createdBy?: { source?: string; userId?: string } | null;
  masterEventId?: string;
  rescheduledAt?: string | null;
  deleted?: boolean;
}

export interface GhlContact {
  id: string;
  firstName?: string;
  lastName?: string;
  contactName?: string;
  dateAdded?: string;
  dateUpdated?: string;
  assignedTo?: string | null;
  source?: string | null;
  tags?: string[];
}

/** Fields read from GET /contacts/{id} (Version 2021-07-28). Anything missing shows as "—". */
export interface GhlContactDetail extends GhlContact {
  name?: string;
  email?: string | null;
  phone?: string | null;
  locationId?: string;
}

export interface GhlContactsList {
  contacts: GhlContact[];
  meta?: { total?: number; startAfterId?: string; startAfter?: number; nextPageUrl?: string; nextPage?: number | null };
}

export interface GhlOpportunity {
  id: string;
  name?: string;
  monetaryValue?: number | null;
  pipelineId: string;
  pipelineStageId: string;
  assignedTo?: string | null;
  status: string;
  source?: string;
  lastStatusChangeAt?: string;
  lastStageChangeAt?: string;
  createdAt?: string;
  updatedAt?: string;
  contactId?: string;
  customFields?: unknown[];
}

export interface GhlOpportunitySearch {
  opportunities: GhlOpportunity[];
  meta?: {
    total?: number;
    nextPageUrl?: string;
    startAfterId?: string;
    startAfter?: number;
    currentPage?: number;
    nextPage?: number | null;
  };
}

export interface GhlMessage {
  id: string;
  type?: number;
  messageType?: string;
  direction?: string;
  status?: string;
  dateAdded?: string;
  userId?: string;
  source?: string;
  contactId?: string;
  conversationId?: string;
  // The spec documents meta.callStatus / meta.callDuration. The live account
  // (checked 2026-10-11) returns meta.call.status and also mirrors the status
  // in the top-level `status` field, so both shapes are read.
  meta?: {
    callDuration?: string | number;
    callStatus?: string;
    call?: { status?: string; duration?: string | number };
  };
}

export interface GhlMessageExport {
  messages: GhlMessage[];
  nextCursor?: string;
  total?: number;
}

export interface GhlContactsPage {
  contacts: unknown[];
  meta?: { total?: number; startAfterId?: string; startAfter?: number; nextPageUrl?: string };
}

// ---- endpoints ---------------------------------------------------------------

export function getLocation(): Promise<GhlResult<{ location: GhlLocation }>> {
  const { locationId } = getEnv();
  return ghlGet(`/locations/${locationId}`, "2021-07-28");
}

export function getPipelines(): Promise<GhlResult<{ pipelines: GhlPipeline[] }>> {
  const { locationId } = getEnv();
  return ghlGet("/opportunities/pipelines", "2021-07-28", { locationId });
}

export function getUsers(): Promise<GhlResult<{ users: GhlUser[] }>> {
  const { locationId } = getEnv();
  return ghlGet("/users/", "2021-07-28", { locationId });
}

export function getTags(): Promise<GhlResult<{ tags: GhlTag[] }>> {
  const { locationId } = getEnv();
  return ghlGet(`/locations/${locationId}/tags`, "2021-07-28");
}

export function getCustomFields(
  model: "contact" | "opportunity" | "all" = "all",
): Promise<GhlResult<{ customFields: GhlCustomField[] }>> {
  const { locationId } = getEnv();
  return ghlGet(`/locations/${locationId}/customFields`, "2021-07-28", { model });
}

export function getCalendars(): Promise<GhlResult<{ calendars: GhlCalendar[] }>> {
  const { locationId } = getEnv();
  return ghlGet("/calendars/", "2021-04-15", { locationId });
}

/** Events on one calendar between two instants (epoch milliseconds). */
export function getCalendarEvents(
  calendarId: string,
  startMs: number,
  endMs: number,
): Promise<GhlResult<{ events: GhlCalendarEvent[] }>> {
  const { locationId } = getEnv();
  return ghlGet("/calendars/events", "2021-04-15", {
    locationId,
    calendarId,
    startTime: startMs,
    endTime: endMs,
  });
}

export interface OpportunitySearchParams {
  pipelineId?: string;
  stageId?: string;
  status?: "open" | "won" | "lost" | "abandoned" | "all";
  limit?: number; // max 100 per spec
  page?: number;
  startAfterId?: string;
  startAfter?: string;
  order?: string; // spec example: "added_asc"
}

export function searchOpportunities(p: OpportunitySearchParams): Promise<GhlResult<GhlOpportunitySearch>> {
  const { locationId } = getEnv();
  return ghlGet("/opportunities/search", "2021-07-28", {
    location_id: locationId,
    pipeline_id: p.pipelineId,
    pipeline_stage_id: p.stageId,
    status: p.status,
    limit: p.limit,
    page: p.page,
    startAfterId: p.startAfterId,
    startAfter: p.startAfter,
    order: p.order,
  });
}

export interface MessageExportParams {
  channel?: "Call" | "SMS" | "Email" | "WhatsApp" | "Instagram" | "Facebook";
  limit?: number; // 10..500 per spec
  cursor?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
}

export function exportMessages(p: MessageExportParams): Promise<GhlResult<GhlMessageExport>> {
  const { locationId } = getEnv();
  return ghlGet("/conversations/messages/export", "2021-04-15", {
    locationId,
    channel: p.channel,
    limit: p.limit,
    cursor: p.cursor,
    startDate: p.startDate,
    endDate: p.endDate,
    sortBy: p.sortBy,
    sortOrder: p.sortOrder,
  });
}

/**
 * The audio recording attached to one call message, streamed (read-only GET).
 * Verified 2026-10-14 against the live account: connected calls return
 * audio/x-wav with the message id (not altId); calls without a recording
 * return HTTP 422 "Message does not have recording".
 */
export function getCallRecording(messageId: string) {
  const { locationId } = getEnv();
  return ghlGetStream(`/conversations/messages/${encodeURIComponent(messageId)}/locations/${encodeURIComponent(locationId)}/recording`, "2021-04-15");
}

/** One contact by id, read-only. Used by drilldowns for email and phone, one call per listed contact. */
export function getContact(contactId: string): Promise<GhlResult<{ contact: GhlContactDetail }>> {
  return ghlGet(`/contacts/${encodeURIComponent(contactId)}`, "2021-07-28");
}

/** One page of contacts; used only to confirm access and read the total. */
export function getContactsPage(limit = 1): Promise<GhlResult<GhlContactsPage>> {
  const { locationId } = getEnv();
  return ghlGet("/contacts/", "2021-07-28", { locationId, limit });
}

/** One page (max 100) of contacts, cursor-paged with startAfterId + startAfter. */
export function listContacts(cursor?: { startAfterId: string; startAfter: number }): Promise<GhlResult<GhlContactsList>> {
  const { locationId } = getEnv();
  return ghlGet("/contacts/", "2021-07-28", {
    locationId,
    limit: 100,
    startAfterId: cursor?.startAfterId,
    startAfter: cursor?.startAfter,
  });
}
