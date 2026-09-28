import { ClientProfile } from '../entities/client-profile.entity';
import { Cpf } from '../value-objects/cpf';

export abstract class ClientProfileRepository {
  abstract findByUserId(userId: string): Promise<ClientProfile | null>;
  abstract existsByCpf(cpf: Cpf): Promise<boolean>;
  abstract save(profile: ClientProfile): Promise<void>;
  /** Remove o perfil na exclusão do CLIENT (RN11, LGPD). */
  abstract delete(userId: string): Promise<void>;
}
