import { ClientProfile } from '../../domain/entities/client-profile.entity';
import { User } from '../../domain/entities/user.entity';
import { Role } from '../../domain/value-objects/role';
import { UserStatus } from '../../domain/value-objects/user-status';

/** CLIENT como é devolvido a ADMIN e SUPER_ADMIN nas rotas de `/api/clients`. */
export interface ClientOutput {
  id: string;
  role: Role;
  name: string;
  email: string;
  status: UserStatus;
  /** Sempre mascarado (`***.456.789-**`), RN12. */
  cpf: string;
  /** Só dígitos. */
  phone: string;
  birthDate: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toClientOutput(client: User, profile: ClientProfile): ClientOutput {
  return {
    id: client.id,
    role: client.role,
    name: client.name,
    email: client.email.value,
    status: client.status,
    cpf: profile.cpf.masked(),
    phone: profile.phone.value,
    birthDate: profile.birthDate.value,
    lastLoginAt: client.lastLoginAt,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}
