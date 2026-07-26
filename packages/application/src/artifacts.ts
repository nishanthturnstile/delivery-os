import type {
  ApprovalDecisionRecord,
  Artifact,
  ArtifactAttachment,
  ArtifactBaseline,
  ArtifactComment,
  ArtifactDraftRevision,
  ArtifactExport,
  ArtifactMutationResult,
  CancelArtifactExportCommand,
  CancelApprovalRequestCommand,
  CreateArtifactCommand,
  CreateArtifactCommentCommand,
  CreateArtifactDeltaCommand,
  DecideArtifactApprovalCommand,
  MutateArtifactCommentCommand,
  RegisterArtifactAttachmentCommand,
  RemoveArtifactAttachmentCommand,
  RequestArtifactExportCommand,
  ReviewSnapshot,
  SaveDraftRevisionCommand,
  SetArtifactAudienceCommand,
  SubmitArtifactForReviewCommand,
} from '@delivery-os/contracts';

export interface ArtifactCommandStore {
  createArtifact(command: CreateArtifactCommand): Promise<ArtifactMutationResult>;
  saveDraftRevision(command: SaveDraftRevisionCommand): Promise<ArtifactMutationResult>;
  submitForReview(command: SubmitArtifactForReviewCommand): Promise<ArtifactMutationResult>;
  decideApproval(command: DecideArtifactApprovalCommand): Promise<ArtifactMutationResult>;
  cancelApprovalRequest(command: CancelApprovalRequestCommand): Promise<ArtifactMutationResult>;
  setAudience(command: SetArtifactAudienceCommand): Promise<ArtifactMutationResult>;
  createDelta(command: CreateArtifactDeltaCommand): Promise<ArtifactMutationResult>;
  createComment(command: CreateArtifactCommentCommand): Promise<ArtifactComment>;
  mutateComment(command: MutateArtifactCommentCommand): Promise<ArtifactComment>;
  registerAttachment(command: RegisterArtifactAttachmentCommand): Promise<ArtifactAttachment>;
  removeAttachment(command: RemoveArtifactAttachmentCommand): Promise<ArtifactAttachment>;
  requestExport(command: RequestArtifactExportCommand): Promise<ArtifactMutationResult>;
  cancelExport(command: CancelArtifactExportCommand): Promise<ArtifactMutationResult>;
}

export interface ArtifactQueryStore {
  listArtifacts(actorId: string, workspaceId: string, projectId: string): Promise<Artifact[]>;
  getArtifact(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<Artifact>;
  getDraft(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<ArtifactDraftRevision>;
  listDraftHistory(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<ArtifactDraftRevision[]>;
  getReviewSnapshot(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
    snapshotId: string,
  ): Promise<ReviewSnapshot>;
  listApprovalHistory(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<ApprovalDecisionRecord[]>;
  listBaselines(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<ArtifactBaseline[]>;
  getAuthoritativeContext(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<{ artifact: Artifact; baseline: ArtifactBaseline; body: unknown }>;
  listComments(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
    targetId: string,
  ): Promise<ArtifactComment[]>;
  listAttachments(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
    targetId: string,
  ): Promise<ArtifactAttachment[]>;
  compareVersions(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
    beforeSnapshotId: string,
    afterSnapshotId: string,
  ): Promise<{
    entries: {
      path: string;
      kind: 'ADDED' | 'REMOVED' | 'CHANGED';
      before?: unknown;
      after?: unknown;
    }[];
    summary: string;
  }>;
  buildSearchProjection(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<{ artifactId: string; title: string; audience: string; body: unknown }>;
  getExportStatus(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
    exportId: string,
  ): Promise<ArtifactExport>;
}

export interface ArtifactExportStorage {
  putImmutable(input: {
    key: string;
    body: Uint8Array;
    contentType: 'application/json';
    contentHash: string;
  }): Promise<void>;
}

export class CreateArtifact {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: CreateArtifactCommand): Promise<ArtifactMutationResult> {
    return this.store.createArtifact(command);
  }
}

export class SaveDraftRevision {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: SaveDraftRevisionCommand): Promise<ArtifactMutationResult> {
    return this.store.saveDraftRevision(command);
  }
}

export class SubmitArtifactForReview {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: SubmitArtifactForReviewCommand): Promise<ArtifactMutationResult> {
    return this.store.submitForReview(command);
  }
}

export class DecideArtifactApproval {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: DecideArtifactApprovalCommand): Promise<ArtifactMutationResult> {
    return this.store.decideApproval(command);
  }
}

export class CancelApprovalRequest {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: CancelApprovalRequestCommand): Promise<ArtifactMutationResult> {
    return this.store.cancelApprovalRequest(command);
  }
}

export class SetArtifactAudience {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: SetArtifactAudienceCommand): Promise<ArtifactMutationResult> {
    return this.store.setAudience(command);
  }
}

export class CreateArtifactDelta {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: CreateArtifactDeltaCommand): Promise<ArtifactMutationResult> {
    return this.store.createDelta(command);
  }
}

export class CreateArtifactComment {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: CreateArtifactCommentCommand): Promise<ArtifactComment> {
    return this.store.createComment(command);
  }
}

export class MutateArtifactComment {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: MutateArtifactCommentCommand): Promise<ArtifactComment> {
    return this.store.mutateComment(command);
  }
}

export class RegisterArtifactAttachment {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: RegisterArtifactAttachmentCommand): Promise<ArtifactAttachment> {
    return this.store.registerAttachment(command);
  }
}

export class RemoveArtifactAttachment {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: RemoveArtifactAttachmentCommand): Promise<ArtifactAttachment> {
    return this.store.removeAttachment(command);
  }
}

export class RequestArtifactExport {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: RequestArtifactExportCommand): Promise<ArtifactMutationResult> {
    return this.store.requestExport(command);
  }
}

export class CancelArtifactExport {
  constructor(private readonly store: ArtifactCommandStore) {}
  execute(command: CancelArtifactExportCommand): Promise<ArtifactMutationResult> {
    return this.store.cancelExport(command);
  }
}
