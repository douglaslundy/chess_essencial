import type { AdminUser, UpdateAdminUserInput } from '@xadrez/contracts';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdminService } from './admin.service.js';

function baseUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    displayName: 'Old Name',
    email: 'old@example.com',
    id: 'user-1',
    isAdmin: false,
    planId: null,
    planName: null,
    roles: ['content_editor'],
    status: 'active',
    username: 'old_username',
    ...overrides,
  };
}

class FakeAdminRepository {
  user: AdminUser;

  constructor(initial: AdminUser) {
    this.user = initial;
  }

  async getUserDetail(userId: string): Promise<AdminUser> {
    if (this.user.id !== userId) throw new NotFoundException('Usuário não encontrado');
    return { ...this.user, roles: [...this.user.roles] };
  }

  async updateUser(
    _actingUserId: string,
    targetUserId: string,
    input: Omit<UpdateAdminUserInput, 'planId'>,
  ): Promise<AdminUser> {
    if (this.user.id !== targetUserId) throw new NotFoundException('Usuário não encontrado');
    if (input.displayName !== undefined) {
      this.user = { ...this.user, displayName: input.displayName };
    }
    if (input.email !== undefined) {
      this.user = { ...this.user, email: input.email };
    }
    if (input.status !== undefined) {
      this.user = { ...this.user, status: input.status };
    }
    if (input.roles !== undefined) {
      this.user = { ...this.user, roles: [...input.roles] };
    }
    return { ...this.user, roles: [...this.user.roles] };
  }
}

class FakeSubscriptionsService {
  constructor(private readonly repository: FakeAdminRepository) {}

  async adminSetPlan(userId: string, planId: string | null) {
    if (this.repository.user.id !== userId) return;
    this.repository.user = {
      ...this.repository.user,
      planId,
      planName: planId === null ? null : 'Plano Atualizado',
    };
  }
}

interface AuditRecord {
  action: string;
  actorUserId: null | string;
  entityId: null | string;
  entityType: string;
  metadata: Record<string, boolean | number | string>;
}

class FakeAuditService {
  records: AuditRecord[] = [];

  async record(
    actorUserId: null | string,
    action: string,
    entityType: string,
    entityId: null | string,
    metadata: Record<string, boolean | number | string> = {},
  ) {
    this.records.push({ action, actorUserId, entityId, entityType, metadata });
  }
}

describe('AdminService.updateUser audit trail', () => {
  let repository: FakeAdminRepository;
  let subscriptions: FakeSubscriptionsService;
  let audit: FakeAuditService;
  let service: AdminService;

  beforeEach(() => {
    repository = new FakeAdminRepository(baseUser());
    subscriptions = new FakeSubscriptionsService(repository);
    audit = new FakeAuditService();
    service = new AdminService(
      repository as never,
      {} as never,
      subscriptions as never,
      audit as never,
    );
  });

  it('records the before/after value of every changed profile field, not just its name', async () => {
    await service.updateUser('admin-1', 'user-1', {
      displayName: 'New Name',
      email: 'new@example.com',
      roles: ['admin', 'content_editor'],
      status: 'suspended',
    });

    expect(audit.records).toHaveLength(1);
    const [entry] = audit.records;
    expect(entry).toMatchObject({
      action: 'admin.user_updated',
      actorUserId: 'admin-1',
      entityId: 'user-1',
      entityType: 'user',
    });
    expect(entry!.metadata).toEqual({
      display_name_after: 'New Name',
      display_name_before: 'Old Name',
      email_after: 'new@example.com',
      email_before: 'old@example.com',
      roles_after: 'admin, content_editor',
      roles_before: 'content_editor',
      status_after: 'suspended',
      status_before: 'active',
    });
  });

  it('only audits the fields actually present in the request, not the whole profile', async () => {
    await service.updateUser('admin-1', 'user-1', { displayName: 'Only This Changed' });

    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]!.metadata).toEqual({
      display_name_after: 'Only This Changed',
      display_name_before: 'Old Name',
    });
  });

  it('renders a null display name as a readable placeholder instead of dropping it', async () => {
    repository.user = baseUser({ displayName: null });

    await service.updateUser('admin-1', 'user-1', { displayName: 'Now Set' });

    expect(audit.records[0]!.metadata).toEqual({
      display_name_after: 'Now Set',
      display_name_before: '(vazio)',
    });
  });

  it('audits a plan grant with the old and new plan id, not just that "planId" changed', async () => {
    await service.updateUser('admin-1', 'user-1', { planId: 'plan-999' });

    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]!.metadata).toEqual({
      plan_id_after: 'plan-999',
      plan_id_before: '(vazio)',
    });
    // The returned user reflects the plan change too.
    const updated = await service.updateUser('admin-1', 'user-1', {});
    expect(updated.planId).toBe('plan-999');
    expect(updated.planName).toBe('Plano Atualizado');
  });

  it('audits revoking a plan back to null', async () => {
    repository.user = baseUser({ planId: 'plan-999', planName: 'Plano Atualizado' });

    await service.updateUser('admin-1', 'user-1', { planId: null });

    expect(audit.records[0]!.metadata).toEqual({
      plan_id_after: '(vazio)',
      plan_id_before: 'plan-999',
    });
  });

  it('audits a combined profile + plan edit in a single record with every before/after pair', async () => {
    await service.updateUser('admin-1', 'user-1', {
      displayName: 'Combined Edit',
      planId: 'plan-42',
    });

    expect(audit.records).toHaveLength(1);
    expect(audit.records[0]!.metadata).toEqual({
      display_name_after: 'Combined Edit',
      display_name_before: 'Old Name',
      plan_id_after: 'plan-42',
      plan_id_before: '(vazio)',
    });
  });
});
