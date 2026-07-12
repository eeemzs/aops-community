import { failureLegacy as failure, type XfResultLegacy as XfResult } from '@aopslab/xf-core';
import type { IRateLimiterServicePort } from '../ports/inbound/IRateLimiterServicePort.js';
import { Effect } from 'effect'
import type { RateLimitRule } from '../ports/types.js';

export interface WithRateLimitParams<T> {
  /** Anahtar (IP, userId, e-posta vs.) */
  key: string;
  /** İşlem scope'u (login, register, api, …) */
  scope: string;
  /** RateLimiter service port – testlerde opsiyonel */
  rateLimiter?: IRateLimiterServicePort;
  /** Geçerli kuralı override etmek için */
  rule?: RateLimitRule;

  /** Asıl iş mantığını çağıran fonksiyon */
  exec: () => Promise<XfResult<T>>;

  /** Hangi durumda deneme kaydedilsin? */
  recordBefore?: boolean;
  recordOnFailure?: boolean;
  /** Başarılı olursa limiter temizlensin mi? */
  resetOnSuccess?: boolean;

  /** Bloklandığında domain-özel hata oluşturan callback */
  onBlocked?: (resetAt?: Date | null) => XfResult<T>;
}

/**
 * Asenkron iş akışını rate-limit korumasıyla sarmalayarak çalıştırır.
 * İhtiyaca göre deneme kaydetme / resetleme stratejileri parametreyle belirlenir.
 */
export async function withRateLimit<T>(params: WithRateLimitParams<T>): Promise<XfResult<T>> {
  const {
    rateLimiter,
    key,
    scope,
    exec,
    rule,
    recordBefore = false,
    recordOnFailure = false,
    resetOnSuccess = false,
    onBlocked
  } = params;

  // Eğer rateLimiter verilmemişse doğrudan iş mantığını çağır
  if (!rateLimiter) {
    return exec();
  }

  // 1) Blok kontrolü
  const status = await Effect.runPromise(rateLimiter.checkRateLimit(key, scope));
  if (status.isBlocked) {
    // Domain-özel hata oluşturucu sağlandıysa onu kullan
    if (onBlocked) {
      return onBlocked(status.rateLimiter?.resetAt);
    }
    // Aksi halde generic failure dön
    return failure<T>({
      messageText: 'Too many attempts',
      opts: {
        domain: 'rate-limiter',
        code: 'RATE_LIMIT_BLOCKED',
        stage: 'withRateLimit:checkRateLimit',
        debug: { key, scope }
      },
      data: undefined as unknown as T
    });
  }

  // 2) İsteniyorsa deneme önceden kaydedilsin (ör: register)
  if (recordBefore) {
    const attemptRes = await Effect.runPromise(rateLimiter.recordAttempt(key, scope, rule));

    // Eğer bu kayıt sonrasında bloklandıysa işi çalıştırmadan hemen dön
    if (attemptRes.isBlocked) {
      if (onBlocked) {
        return onBlocked(attemptRes.rateLimiter?.resetAt);
      }

      return failure<T>({
        messageText: 'Too many attempts',
        opts: {
          domain: 'rate-limiter',
          code: 'RATE_LIMIT_BLOCKED',
          stage: 'withRateLimit:recordBefore',
          debug: { key, scope }
        },
        data: undefined as unknown as T
      });
    }
  }

  // 3) Asıl iş mantığını çalıştır
  const result = await exec();

  // 4) Başarı/başarısızlığa göre limiter güncelle
  if (!result.ok && recordOnFailure) {
    const attemptRes = await Effect.runPromise(rateLimiter.recordAttempt(key, scope, rule));
    if (attemptRes.isBlocked && onBlocked) {
      return onBlocked(attemptRes.rateLimiter?.resetAt);
    }
  } else if (result.ok && resetOnSuccess) {
    await Effect.runPromise(rateLimiter.resetRateLimit(key, scope));
  }

  return result;
}
