import { BusinessRuleError } from '@shared/domain/errors/business-rule.error';

/**
 * RN38: quem vota precisa estar perto do reporte (`REPORT_VOTE_MAX_DISTANCE_METERS`). A mensagem
 * e os detalhes trazem só o limite, nunca a localização nem a distância de quem votou.
 */
export class VoterTooFarError extends BusinessRuleError {
  constructor(maxDistanceMeters: number) {
    super(`Você precisa estar a até ${maxDistanceMeters} m do reporte para votar.`, {
      maxDistanceMeters,
    });
  }
}
