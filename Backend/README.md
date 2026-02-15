# Backend

Bu klasor, mevcut `Frontend/` prototipini bozmadan Node.js tabanli backend'e gecis icin referans calisma alanidir.

## 1. Hedef Teknoloji

- Runtime: `Node.js (LTS)`
- Framework: `Express` (veya `Fastify`)
- Veritabani: `PostgreSQL`
- DB Araci: `DBeaver` (mevcut kullanimin devam eder)
- Kimlik: `JWT Access Token + Refresh Token`
- Roller: `sube`, `merkez`, `admin`

## 2. Proje Yapisi Onerisi

1. `Backend/src/app.js`
   - Express/Fastify instance, global middleware, route mount
2. `Backend/src/config/`
   - `env`, `db`, `logger` ayarlari
3. `Backend/src/modules/`
   - `auth`, `users`, `branches`, `products`, `orders`, `admin`
4. `Backend/src/common/`
   - `errors`, `middlewares`, `utils`, `constants`
5. `Backend/prisma/` veya `Backend/src/db/migrations/`
   - Migration ve seed dosyalari
6. `Backend/tests/`
   - Unit + integration testler

## 3. Frontend'i Bozmadan Gecis Prensibi

1. Frontend `TEST_MODE=true` ile calismaya devam eder.
2. Frontend servis katmani adapter mantigiyla ilerler:
   - Ilk asama: `localStorage/mock`
   - Ikinci asama: `REST API`
3. Gecis parcali yapilir:
   - Auth -> Products/Branches -> Orders -> Admin
4. Her asamada smoke test + rollback noktasi tutulur.

## 4. Sifirdan Kurulum Sirasi (Node.js + PostgreSQL)

1. Backend proje iskeleti
   - `npm init`
   - Temel paketler: `express|fastify`, `cors`, `helmet`, `dotenv`, `zod`, `jsonwebtoken`, `bcrypt`
2. Veritabani baglantisi
   - PostgreSQL baglanti stringi `.env` ile yonetilir
   - Pool yapisi kurulur (`pg`)
3. Migration altyapisi
   - `Prisma` veya `Knex` secimi
   - Ilk migration: `users`, `branches`, `products`, `orders`, `order_items`, `branch_price_adjustments`, `audit_logs`
4. Seed
   - Roller, admin kullanicisi, ornek sube ve urun datasi
5. Auth
   - `POST /auth/login`, `GET /me`, refresh token akisi
6. Role middleware
   - `requireAuth`, `requireRole('admin'|'merkez'|'sube')`
7. Modul endpointleri
   - Users/Admin, Branches, Products, Orders
8. Validation + error handling
   - DTO/request validasyonu (`zod`)
   - Standard hata cevabi ve error code yapisi
9. Logging + health
   - Request log + error log
   - `GET /health`
10. Test
   - Unit: fiyat hesaplama, yetki kontrolleri
   - Integration: login, siparis olusturma, onay akislari

## 5. DBeaver ile Calisma Notu

1. DBeaver ile DB olusturmak ve SQL sorgu test etmek sorunsuz devam eder.
2. Uygulama migration aracini kullansa bile DBeaver ile tablolari inceleyebilirsin.
3. Oneri:
   - DDL degisikliklerini migration dosyasi uzerinden yonet
   - DBeaver'i kontrol/gozlem ve ad-hoc sorgu icin kullan
4. Boylesi canliya cikista surum takibi ve geri donusu guvenli yapar.

## 6. API Kontrati

- Taslak kontrat dosyasi: `Backend/api-contract/openapi.yaml`
- Frontend ve backend bu dosyaya gore paralel gelistirilir.

## 7. Canliya Hazirlik Kontrol Listesi

1. `.env` ve secret yonetimi tamamlandi.
2. Migration/seed pipeline'i otomatik.
3. Role-based yetki testleri gecti.
4. Staging ortaminda UAT tamamlandi.
5. Loglama + hata izleme aktif.
6. Backup/restore proseduru test edildi.

## 8. Uygulama Sirasi (Pratik Sprint Plani)

1. Sprint 1
   - Auth + user/role altyapisi
   - DB migration + seed
2. Sprint 2
   - Branch + product modulleri
   - Merkez ekranlarinin API entegrasyonu
3. Sprint 3
   - Orders modulu + onay akislari
   - Sube ekranlarinin API entegrasyonu
4. Sprint 4
   - Admin modulu + audit logs
   - Staging ve canliya hazirlik
