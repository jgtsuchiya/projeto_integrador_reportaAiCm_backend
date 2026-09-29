import { User } from '../../domain/entities/user.entity';
import { Role } from '../../domain/value-objects/role';
import { UserStatus } from '../../domain/value-objects/user-status';

/** ADMIN como é devolvido ao SuperAdm nas rotas de `/api/admins`. */
export interface AdminOutput {
  id: string;
  role: Role;
  name: string;
  email: string;
  status: UserStatus;
  /** Preenchido quando o ADMIN aceita o convite. */
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  /** SuperAdm que fez o convite. */
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toAdminOutput(admin: User): AdminOutput {
  return {
    id: admin.id,
    role: admin.role,
    name: admin.name,
    email: admin.email.value,
    status: admin.status,
    emailVerifiedAt: admin.emailVerifiedAt,
    lastLoginAt: admin.lastLoginAt,
    createdById: admin.createdById,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}
