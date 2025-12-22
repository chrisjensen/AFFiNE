# Move Document Feature - Requirements Specification

## Document Information

- **Feature:** Move Document Between Workspaces
- **Issue:** [GitHub #6743](https://github.com/toeverything/AFFiNE/issues/6743)
- **Status:** Draft
- **Last Updated:** 2025-12-22

---

## 1. Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

| Term            | Definition                                                         |
| --------------- | ------------------------------------------------------------------ |
| Document        | A page or edgeless document within AFFiNE                          |
| Workspace       | A container for documents, owned by a user or team                 |
| Space           | A permission-isolated container within a workspace                 |
| Linked Document | A document referenced by another document via inline link or embed |
| Outgoing Links  | Documents directly referenced by the source document               |
| Nested Links    | Documents referenced by immediate links, recursively               |

---

## 2. Menu Item Requirements

### REQ-MENU-001: Menu Label

The system SHALL display a menu item labeled "Move..." in the document operations menu.
(This replaces the Move to Space menu item that currently exists)

### REQ-MENU-002: Menu Placement

The "Move..." menu item SHOULD appear after the "Duplicate" menu item in the operations menu.

### REQ-MENU-003: Menu Availability

When the user lacks edit permission on the document, the "Move..." menu item MUST be disabled.

### REQ-MENU-004: Menu Action

When the user selects "Move...", the system SHALL open the Move Document dialog.

---

## 3. Dialog Requirements

### 3.1 Dialog Structure

#### REQ-DLG-001: Dialog Display

When the Move Document dialog opens, the system SHALL display:

- A workspace selector
- A space selector
- A "Move all Linked Documents" checkbox
- A link depth selector (when linked documents checkbox is checked)
- Cancel and Move action buttons

#### REQ-DLG-002: Workspace Selector

The workspace selector MUST list all workspaces where the user has permission to create documents.
The default value of the workspace selector MUST be the current workspace

#### REQ-DLG-004: Space Selector Display

The system MUST display a space selector.
The default value of the space selector MUST be the current space. ("Default Space" if the document is not in a space)

### 3.2 Linked Documents

#### REQ-LINK-001: Linked Documents Checkbox

The dialog MUST include a checkbox labeled "Move all Linked Documents".

#### REQ-LINK-002: Linked Documents Default State

The "Move all Linked Documents" checkbox SHOULD be unchecked by default.

#### REQ-LINK-003: Link Depth Selector

When the "Move all Linked Documents" checkbox is checked, the system SHALL display a dropdown with options:

- "Immediately Linked" (default)
- "Follow Nested Links"

#### REQ-LINK-004: Linked Documents Action

When "Move all Linked Documents" is selected, all documents listed in "Outgoing links" of the document to move MUST also be moved.

#### REQ-LINK-005: Nested Links Definition

When "Follow Nested Links" is selected, the system MUST also recursively include all documents reachable through following outgoing links of the document and recursively following such references.

#### REQ-LINK-006: Linked Documents Preview

When linked documents are selected for moving, the system SHOULD display a preview list showing:

- The count of documents to be moved
- The titles of documents to be moved (where available)

#### REQ-LINK-007: Circular Reference Handling

The system MUST handle circular references without infinite loops by tracking visited documents.

---

## 4. Permission Requirements

### 4.1 Source Permissions

#### REQ-PERM-001: Source Document Permission

The user MUST have edit permission on the source document to initiate a move.

#### REQ-PERM-002: Linked Documents Permission

When moving linked documents, the user MUST have edit permission on ALL linked documents to be moved.

### 4.2 Target Permissions

#### REQ-PERM-003: Target Workspace Permission

The user MUST have permission to create documents in the target workspace.

#### REQ-PERM-004: Target Space Permission

Where a target space is selected, the user MUST have permission to create documents in that space.

### 4.3 Permission Validation

#### REQ-PERM-005: Pre-validation

The system MUST validate all permissions before beginning the move operation.

#### REQ-PERM-006: Permission Failure Display

If permission validation fails, the system MUST display a clear error message indicating which permission is missing.

#### REQ-PERM-007: Move Button State

While the user lacks required permissions for the selected target, the Move button MUST be disabled.

#### REQ-PERM-008: Move Button State

For cloud stored workspaces, permissions MUST be enforced at the API.
It is insufficient to rely on the client to apply permission checks.

---

## 5. Move Operation Requirements

### 5.1 Atomicity

#### REQ-OP-001: All-or-Nothing Semantics

The move operation MUST be atomic: either all documents are moved successfully, or no documents are moved.

#### REQ-OP-002: Failure Rollback

If any document fails to move, the system MUST NOT modify any documents and MUST report the failure.

### 5.2 Data Transfer

#### REQ-OP-003: Document Content

The system MUST transfer all document content including:

- Document snapshot (current state)
- Pending updates
- Document metadata (mode, properties)

#### REQ-OP-004: Blob Transfer

The system MUST copy all blobs (images, attachments) referenced by moved documents to the target workspace.

#### REQ-OP-005: Source Deletion

Upon successful transfer, the system MUST delete the source documents from the original workspace.

#### REQ-OP-006: Document ID Preservation

The system MUST preserve the original document ID when moving documents to a new workspace.

### 5.3 External Link Compatibility

#### REQ-OP-007: Moved Document Detection

When a document is requested at a workspace where it no longer exists, the system SHALL query for the document by ID across all workspaces.

#### REQ-OP-008: 301 Redirect Response

When a moved document is found in a different workspace, the system SHALL return a 301 Moved Permanently response with the Location header pointing to the correct workspace URL. This preserves workspace API isolation.

#### REQ-OP-009: Redirect Permission Check

The 301 redirect SHOULD be returned regardless of whether the user has access to the target workspace. Permission checks occur when the client follows the redirect.

#### REQ-OP-010: Document Not Found

If the document is not found in any workspace, the system SHALL return 404 Not Found.

#### REQ-OP-011: Fallback Index Requirement

The system SHOULD maintain an index on document ID (without workspace scoping) to enable efficient cross-workspace lookup for redirect resolution.

### 5.4 Exclusions

#### REQ-OP-012: Public Status

The system MAY preserve public/published status when moving documents.

#### REQ-OP-013: Permission Grants

The system SHOULD attempt to preserve document-level permission grants when moving documents.
Any permissions granted to users not in the new workspace MUST be removed.

#### REQ-OP-014: Trash Documents

If the source document is in trash, the system MUST reject the move operation with a clear error message.

---

## 6. Affected Endpoints

The 301 redirect logic only needs to be implemented at document "entry points" - where users first navigate to a document via URL. Once in the correct workspace context, all subsequent requests use the correct workspace ID.

### 6.1 Entry Points Requiring 301 Redirect

| Endpoint                             | File                         | Notes                                               |
| ------------------------------------ | ---------------------------- | --------------------------------------------------- |
| `GET /workspace/:workspaceId/:docId` | Frontend router              | Primary navigation entry point                      |
| `GET /workspace/*path`               | `doc-renderer/controller.ts` | Public/shared document links                        |
| `GET /:id/docs/:guid`                | `controller.ts`              | Direct document binary fetch (if accessed directly) |

### 6.2 Endpoints NOT Requiring Redirect

All other endpoints assume the user is already in the correct workspace context:

- Document history, comments, sync, permissions, metadata
- These are secondary requests made after initial document load
- If workspace is wrong, they return 404 (user should not be in this state)

---

## 7. Feedback Requirements

### 7.1 Progress Indication

#### REQ-FB-001: Button State During Operation

While the move operation is in progress, the Move and Cancel buttons MUST be disabled.

### 7.2 Success Feedback

#### REQ-FB-002: Success Notification

Upon successful move, the system SHALL display a success notification.

#### REQ-FB-003: Dialog Close on Success

Upon successful move, the system SHALL close the Move Document dialog.

#### REQ-FB-004: Navigation After Move

Upon successful move, the system SHOULD navigate the user to the moved document in the target workspace.

### 7.3 Error Feedback

#### REQ-FB-005: Error Notification

If the move operation fails, the system SHALL display an error notification with a meaningful message.

#### REQ-FB-006: Dialog Persistence on Error

If the move operation fails, the system SHALL keep the dialog open to allow retry or cancellation.

---

## 8. Platform Requirements

### REQ-PLAT-001: Cloud Workspaces

The move feature MUST support moving documents between cloud workspaces.

### REQ-PLAT-002: Local Workspaces

The move feature MAY support moving documents to/from local workspaces in a future iteration.

---

## 9. Non-Functional Requirements

### REQ-NF-001: Response Time

The permission validation SHOULD complete within 2 seconds for typical document sets (< 50 linked documents).

### REQ-NF-002: Accessibility

The dialog MUST be keyboard navigable and screen reader compatible.

### REQ-NF-003: Internationalization

All user-facing strings MUST be internationalized using the existing i18n infrastructure.

---

## 10. Traceability Matrix

| Requirement                  | Component                             | Priority |
| ---------------------------- | ------------------------------------- | -------- |
| REQ-MENU-\*                  | Frontend - operation-cell.tsx         | High     |
| REQ-DLG-\*                   | Frontend - move-doc dialog            | High     |
| REQ-LINK-\*                  | Frontend - dialog + Backend - service | High     |
| REQ-PERM-001 to REQ-PERM-007 | Backend - DocMoveService              | Critical |
| REQ-PERM-008                 | Backend - All resolvers               | Critical |
| REQ-OP-001 to REQ-OP-005     | Backend - DocMoveService              | Critical |
| REQ-OP-006                   | Backend - DocMoveService              | High     |
| REQ-OP-007 to REQ-OP-011     | Backend/Frontend - 3 entry points     | High     |
| REQ-OP-012 to REQ-OP-014     | Backend - DocMoveService              | Medium   |
| REQ-FB-\*                    | Frontend - dialog                     | Medium   |
| REQ-PLAT-\*                  | Full Stack                            | High/Low |
| REQ-NF-\*                    | Full Stack                            | Medium   |
