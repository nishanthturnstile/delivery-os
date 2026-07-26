import { describe, expect, it, vi } from 'vitest';

import {
  CancelApprovalRequest,
  CancelArtifactExport,
  CreateArtifact,
  CreateArtifactComment,
  CreateArtifactDelta,
  DecideArtifactApproval,
  MutateArtifactComment,
  RegisterArtifactAttachment,
  RemoveArtifactAttachment,
  RequestArtifactExport,
  SaveDraftRevision,
  SetArtifactAudience,
  SubmitArtifactForReview,
  type ArtifactCommandStore,
} from './artifacts';

describe('artifact application commands', () => {
  it('delegates commands without weakening the typed boundary', async () => {
    const createArtifact = vi.fn().mockResolvedValue({ artifactId: 'artifact' });
    const saveDraftRevision = vi.fn().mockResolvedValue({ artifactId: 'artifact' });
    const store = {
      createArtifact,
      saveDraftRevision,
    } as unknown as ArtifactCommandStore;
    const command = { artifactId: 'artifact' } as never;
    await new CreateArtifact(store).execute(command);
    await new SaveDraftRevision(store).execute(command);
    expect(createArtifact).toHaveBeenCalledWith(command);
    expect(saveDraftRevision).toHaveBeenCalledWith(command);
  });

  it('keeps every lifecycle action behind the command store', async () => {
    const result = {
      schemaVersion: '1',
      artifactId: 'artifact',
      revision: 1,
      state: 'DRAFT',
      replayed: false,
      correlationId: 'correlation',
    };
    const comment = { id: 'comment' };
    const attachment = { id: 'attachment' };
    const submitForReview = vi.fn().mockResolvedValue(result);
    const decideApproval = vi.fn().mockResolvedValue(result);
    const cancelApprovalRequest = vi.fn().mockResolvedValue(result);
    const setAudience = vi.fn().mockResolvedValue(result);
    const createDelta = vi.fn().mockResolvedValue(result);
    const createComment = vi.fn().mockResolvedValue(comment);
    const mutateComment = vi.fn().mockResolvedValue(comment);
    const registerAttachment = vi.fn().mockResolvedValue(attachment);
    const removeAttachment = vi.fn().mockResolvedValue(attachment);
    const requestExport = vi.fn().mockResolvedValue(result);
    const cancelExport = vi.fn().mockResolvedValue(result);
    const store = {
      submitForReview,
      decideApproval,
      cancelApprovalRequest,
      setAudience,
      createDelta,
      createComment,
      mutateComment,
      registerAttachment,
      removeAttachment,
      requestExport,
      cancelExport,
    } as unknown as ArtifactCommandStore;
    const command = {} as never;
    await new SubmitArtifactForReview(store).execute(command);
    await new DecideArtifactApproval(store).execute(command);
    await new CancelApprovalRequest(store).execute(command);
    await new SetArtifactAudience(store).execute(command);
    await new CreateArtifactDelta(store).execute(command);
    await new CreateArtifactComment(store).execute(command);
    await new MutateArtifactComment(store).execute(command);
    await new RegisterArtifactAttachment(store).execute(command);
    await new RemoveArtifactAttachment(store).execute(command);
    await new RequestArtifactExport(store).execute(command);
    await new CancelArtifactExport(store).execute(command);
    expect(submitForReview).toHaveBeenCalledOnce();
    expect(requestExport).toHaveBeenCalledOnce();
    expect(cancelExport).toHaveBeenCalledOnce();
    expect(mutateComment).toHaveBeenCalledOnce();
    expect(removeAttachment).toHaveBeenCalledOnce();
  });
});
