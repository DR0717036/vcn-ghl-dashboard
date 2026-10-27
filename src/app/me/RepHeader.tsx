// The top of the rep dashboard: a large photo (or initials), name, plan
// badge, and the quota / plan line, left-aligned with the page content; and,
// when an admin is looking, a notice with the way back to Rep Performance.

import type { RepView } from "@/lib/me/context";

export default function RepHeader({ view }: { view: RepView }) {
  return (
    <div className="me-header">
      {view.viewingAs ? (
        <div className="callout callout-info me-viewing">
          <b>Admin view.</b> You are looking at {view.name}&rsquo;s dashboard exactly as they see it. <a href="/#sec-reps">Back to Rep Performance</a>
        </div>
      ) : null}
      <div className="me-identity">
        <span className="rep-avatar me-avatar">
          {view.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.photoUrl} alt="" width={144} height={144} />
          ) : (
            <span className="rep-avatar-initials" style={{ fontSize: 52 }}>
              {view.initials}
            </span>
          )}
        </span>
        <div>
          <h1 className="page-title me-title">{view.name}</h1>
          <div className="me-plan">
            <span className="pill pill-neutral">{view.role}</span>
            <span className="note">Monthly quota {view.rep.monthlyQuota.toLocaleString("en-US")} submissions · plan {view.rep.commissionPlan}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
