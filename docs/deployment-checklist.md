# Deployment Checklist (Domain/Sunucu Oncesi)

Bu plan, `docs/archive/README-legacy-backend.md` icindeki 7.x mimarisine gore hazirlandi.
Amac: domain ve VPS almadan once release'i risksiz hale getirmek.

## Faz 0 - Hazirlik (Bugun baslanacak)

- [ ] 0.1 `Frontend/assets/app-config.js` kontrolu
  - `TEST_MODE=false`
  - Local gelistirmede `API_BASE_URL=http://localhost:4000/api`

- [ ] 0.2 Backend env anahtar listesi hazir
  - `DATABASE_URL`
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
  - `JWT_ACCESS_EXPIRES_IN`
  - `JWT_REFRESH_EXPIRES_IN`
  - `RATE_LIMIT_STRATEGY`
  - `REDIS_URL` (opsiyonel)

- [ ] 0.3 Uretim veri guvenligi kontrolu
  - repoda secret yok
  - `.env` dosyalari git'e dahil degil

- [ ] 0.4 Son local smoke testi
  - admin login
  - sube siparis olusturma
  - merkez onay/red/teslim
  - raporlar ekrani

## Faz 1 - Domain ve Sunucu Satin Alimi

- [ ] 1.1 Domain alimi
- [ ] 1.2 VPS secimi (MVP: 2vCPU/4GB RAM/80GB SSD)
- [ ] 1.3 Isletim sistemi: Ubuntu 22.04 LTS

## Faz 2 - Sunucu Kurulum

- [ ] 2.1 Temel update/upgrade
- [ ] 2.2 UFW (22,80,443)
- [ ] 2.3 Git + runtime paketleri
- [ ] 2.4 Docker/Compose veya PM2 karari

## Faz 3 - Uygulama Deploy

- [ ] 3.1 Repo clone
- [ ] 3.2 `Backend/.env.production` olusturma
- [ ] 3.3 `npm ci`
- [ ] 3.4 `prisma generate`
- [ ] 3.5 `prisma migrate deploy`
- [ ] 3.6 `npm run seed` (gerekiyorsa)
- [ ] 3.7 Backend service ayaga kaldirma

## Faz 4 - Nginx ve SSL

- [ ] 4.1 `/api` proxy -> `127.0.0.1:4000`
- [ ] 4.2 `/uploads` proxy -> backend uploads
- [ ] 4.3 `/` -> frontend static
- [ ] 4.4 Let's Encrypt SSL
- [ ] 4.5 HTTP -> HTTPS yonlendirme

## Faz 5 - Canli Oncesi Test

- [ ] 5.1 `GET /health` ok
- [ ] 5.2 `npm run test:auth-regression`
- [ ] 5.3 Manuel smoke (admin/merkez/sube)
- [ ] 5.4 Cookie guvenlik kontrolleri

## Faz 6 - Operasyon

- [ ] 6.1 Gunluk DB backup
- [ ] 6.2 Log takibi
- [ ] 6.3 Rollback etiketi (release tag)

## Redis Notu

- Su an `memory` strategy ile devam edilebilir.
- Redis'e gecis, birden fazla instance veya yuksek trafik oldugunda acilmalidir.
