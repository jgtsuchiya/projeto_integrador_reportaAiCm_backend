import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { User } from '../../domain/entities/user.entity';
import { Role } from '../../domain/value-objects/role';
import { UserStatus } from '../../domain/value-objects/user-status';

/**
 * Perfil do usuário logado, como é devolvido nas rotas de `/api/users/me`. É por ele que os
 * fronts descobrem o papel depois do login. Os campos do perfil do CLIENT só aparecem para ele.
 */
export interface ProfileOutput {
  id: string;
  role: Role;
  name: string;
  email: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  /** No CLIENT, a alteração mais recente entre o usuário e o perfil. */
  updatedAt: Date;
  /** Só do CLIENT. Completo, só com dígitos: é o próprio dono quem consulta. */
  cpf?: string;
  /** Só do CLIENT. Só dígitos. */
  phone?: string;
  /** Só do CLIENT. `YYYY-MM-DD`. */
  birthDate?: string;
}

export function toProfileOutput(user: User, profile: ClientProfile | null): ProfileOutput {
  const output: ProfileOutput = {
    id: user.id,
    role: user.role,
    name: user.name,
    email: user.email.value,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };

  if (!profile) {
    return output;
  }

  return {
    ...output,
    updatedAt: profile.updatedAt > user.updatedAt ? profile.updatedAt : user.updatedAt,
    cpf: profile.cpf.value,
    phone: profile.phone.value,
    birthDate: profile.birthDate.value,
  };
}
