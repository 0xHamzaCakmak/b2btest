# Backend

Bu klasor, mevcut `Frontend/` prototipini bozmadan Node.js tabanli backend'e gecis icin referans calisma alanidir.

## 1. Hedef Teknoloji

- Runtime: `Node.js (LTS)`
- Framework: `Express` (veya `Fastify`)
- Veritabani: `Microsoft SQL Server (SQLEXPRESS veya tam surum)`
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

## 4. Sifirdan Kurulum Sirasi (Node.js + MSSQL)

1. Backend proje iskeleti
   - `npm init`
   - Temel paketler: `express|fastify`, `cors`, `helmet`, `dotenv`, `zod`, `jsonwebtoken`, `bcrypt`
2. Veritabani baglantisi
   - SQL Server baglanti stringi `.env` ile yonetilir
   - Prisma datasource `provider = "sqlserver"`
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

## 4.1 Adim 1 Durumu (Tamamlandi)

Kurulanlar:

1. Node proje iskeleti (`package.json`)
2. Temel backend dosyalari:
   - `src/app.js`
   - `src/server.js`
   - `src/config/env.js`
   - `src/config/prisma.js`
3. Prisma init:
   - `prisma/schema.prisma`
   - `prisma.config.ts`
4. Ortam degiskenleri:
   - `.env`
   - `.env.example`
5. NPM scriptleri:
   - `npm run dev`
   - `npm run prisma:validate`
   - `npm run prisma:generate`
   - `npm run prisma:migrate`

Calisma dogrulama:

1. `npm run prisma:validate` -> schema valid
2. `npm run prisma:generate` -> client generate basarili
3. `GET /health` -> `{"ok":true,...}` donuyor

## 4.2 Adim 2 Durumu (MSSQL ile Tamamlandi)

Tamamlananlar:

1. Prisma schema SQL Server uyumlu olacak sekilde guncellendi:
   - Datasource provider `sqlserver`
   - SQL Server ile sorun cikarabilen tipler sadelestirildi
2. PostgreSQL migration gecmisi temizlendi.
3. SQL Server baglantisi dogrulandi (TCP 1433).
4. Ilk SQL Server migration basariyla uygulandi:
   - `prisma/migrations/*_init_sqlserver/migration.sql`
5. Tablolar olustu:
   - `_prisma_migrations`, `users`, `branches`, `products`, `orders`, `order_items`, `branch_price_adjustments`, `audit_logs`

Not:

- SQL Server tarafinda migration icin TCP erisimi acik olmalidir (genelde 1433).
- Bu asamadan sonra tablo degisiklikleri yalniz schema + migration ile yapilmali.

## 4.3 MSSQL Ilk Calistirma Kontrolu (Gerekirse)

1. SQL Server Configuration Manager ac.
2. `SQL Server Network Configuration > Protocols for SQLEXPRESS` altinda `TCP/IP` yi `Enabled` yap.
3. `IPAll` altinda `TCP Port` degerini `1433` yap (istersen farkli statik port da olur).
4. `SQL Server (SQLEXPRESS)` servisini restart et.
5. `.env` icindeki `DATABASE_URL` baglantisini dogru bilgiyle guncelle.
6. Sonra migration calistir:
   - `npx prisma migrate dev --name init_sqlserver`

## 4.4 Tablo Sozlugu (Code First)

Asagidaki tablolar `Backend/prisma/schema.prisma` uzerinden code-first olarak uretilir.

1. `users`
   - Amac: Sisteme giris yapacak kullanicilar ve rolleri.
   - Temel alanlar: `email`, `password_hash`, `role`, `branch_id`, `is_active`, `created_at`, `updated_at`
   - Iliski: `branch_id` ile `branches`, onaylayan kullanici olarak `orders`, islem sahibi olarak `audit_logs`.

2. `branches`
   - Amac: Sube ana kayitlari.
   - Temel alanlar: `name`, `manager`, `phone`, `email`, `address`, `is_active`, `created_at`, `updated_at`
   - Iliski: `users`, `orders`, `branch_price_adjustments`.

3. `products`
   - Amac: Siparise konu urunlerin merkezden yonetimi.
   - Temel alanlar: `code` (unique), `name`, `base_price`, `is_active`, `created_at`, `updated_at`
   - Iliski: `order_items`.

4. `branch_price_adjustments`
   - Amac: Sube bazli fiyat farki (%).
   - Temel alanlar: `branch_id` (unique), `percent`, `created_at`, `updated_at`
   - Iliski: `branches` (1-1).

5. `orders`
   - Amac: Sube siparis baslik kaydi.
   - Temel alanlar: `order_no` (unique), `branch_id`, `status`, `delivery_date`, `delivery_time`, `note`, `total_tray`, `total_amount`, `approved_by`, `approved_at`, `created_at`, `updated_at`
   - Iliski: `branches`, `users` (onaylayan), `order_items`.

6. `order_items`
   - Amac: Siparis satir detaylari.
   - Temel alanlar: `order_id`, `product_id`, `qty_tray`, `unit_price`
   - Iliski: `orders`, `products`.

7. `audit_logs`
   - Amac: Kritik islemlerin izlenebilirlik kaydi.
   - Temel alanlar: `actor_user_id`, `action`, `entity`, `entity_id`, `before_json`, `after_json`, `meta`, `created_at`
   - Iliski: `users`.

8. `_prisma_migrations`
   - Amac: Prisma migration gecmisinin teknik takibi.
   - Not: Uygulama tarafinda dogrudan kullanilmaz.

## 4.5 Adim 3 Durumu (Seed Tamamlandi)

Tamamlananlar:

1. Seed script eklendi:
   - `prisma/seed.js`
   - Komut: `npm run seed`
2. Seed ile olusturulan temel demo veriler:
   - 7 kullanici: `admin@borekci.com`, `merkez@borekci.com`, `sube01..05@borekci.com`
   - 5 sube
   - 9+ urun (merkez urun panelindeki cekirdek urunler + merkezin sonradan ekledikleri)
   - 5 sube fiyat farki kaydi (varsayilan `%0`)
3. Dogrulama:
   - `users=7`, `branches=5`, `products>=9`, `branch_price_adjustments=5`

Demo notu:

- Seed icin kullanici sifresi: `12345678`
- Bu sifre yalniz gelistirme/test icindir, canli ortamda degistirilmelidir.

## 4.6 Adim 4 Durumu (Auth Baslangici Tamamlandi)

Tamamlananlar:

1. Auth route eklendi:
   - `POST /api/auth/login`
2. Kimlik dogrulama middleware eklendi:
   - `requireAuth`
3. Oturum kullanici endpointi eklendi:
   - `GET /api/me` (Bearer access token ile)
4. JWT altyapisi eklendi:
   - Access token (`15m`)
   - Refresh token (`7d`)

Teknik dosyalar:

1. `src/modules/auth/auth.routes.js`
2. `src/common/auth/jwt.js`
3. `src/common/middlewares/require-auth.js`
4. `src/app.js` route baglantilari

Test sonucu:

1. `admin@borekci.com / 12345678` ile login basarili
2. Donen access token ile `GET /api/me` basarili
3. Hatali sifre ile login denemesi `401` donuyor

Not:

- Bu asamada frontend hala localStorage akisinda calisir.
- Frontend login ekraninin backend `POST /api/auth/login` entegrasyonu 4.7 adiminda tamamlanmistir.

## 4.7 Adim 5 Durumu (Frontend Login -> Backend Auth Entegrasyonu Tamamlandi)

Tamamlananlar:

1. Frontend config'e API adresi eklendi:
   - `Frontend/assets/app-config.js`
   - `API_BASE_URL` (varsayilan: `http://localhost:4000/api`)
2. Login formu backend auth'a baglandi:
   - `TEST_MODE=false` iken `POST /api/auth/login` cagirilir
   - Donen `accessToken`, `refreshToken`, `user` bilgileri localStorage `authSession` icine yazilir
3. Role gore yonlendirme:
   - `sube` -> `sube/siparis.html`
   - `merkez` -> `merkez/merkez.html`
   - `admin` -> `admin/index.html`
4. Hata durumlari:
   - Hatali bilgi -> formda hata mesaji
   - Backend kapali/erisilemez -> baglanti hatasi mesaji

Tarayici test adimlari:

1. Backend'i ac:
   - `cd Backend`
   - `npm run dev`
2. Frontend test modunu kapat:
   - `Frontend/assets/app-config.js` icinde `TEST_MODE: false`
3. Tarayicida `Frontend/login.html` ac.
4. Asagidaki demo kullanicilarla dene:
   - `admin@borekci.com / 12345678`
   - `merkez@borekci.com / 12345678`
   - `sube01@borekci.com / 12345678`
5. Basarili login sonrasi role uygun panele yonlendirme gorulmelidir.

## 4.8 Adim 6 Durumu (Kullanici/Şube Gorunen Isim Bilgisi Eklendi)

Tamamlananlar:

1. `users` tablosuna `display_name` alani eklendi (nullable):
   - Migration: `add_user_display_name`
2. Seed verileri gorunen isimlerle guncellendi:
   - `Admin Kullanici`
   - `Merkez 01`
   - `Borekci Sube 01 Yetkilisi`
3. Auth response'lari zenginlestirildi:
   - `POST /api/auth/login` -> `displayName`, `branchName`
   - `GET /api/me` -> `displayName`, `branchName`
4. Frontend login session kaydina eklendi:
   - `displayName`
   - `branchName`

Test sonucu:

1. Sube login testinde:
   - `displayName`: `Borekci Sube 01 Yetkilisi`
   - `branchName`: `Borekci Sube 01`
2. `GET /api/me` ayni bilgileri geri donuyor.

## 4.9 Migration Guvenlik Notu

- Additive migration (yeni tablo, yeni nullable kolon) yaklasimi ile ilerlersek mevcut akis bozulmaz.
- Kirma riski yuksek degisikliklerde (kolon silme/rename, tip daraltma, null->not null):
  1. Once backward-compatible migration
  2. Uygulama kodu gecisi
  3. Son temizlik migration'i
- Bu projede adim adim ve geri alinabilir migration stratejisi uygulanir.

## 4.10 Adim 7 Durumu (Products API + Merkez Paneli Entegrasyonu Tamamlandi)

Tamamlananlar:

1. Products modulu endpointleri eklendi:
   - `GET /api/products`
   - `POST /api/products`
   - `PUT /api/products/:id`
   - `PUT /api/products/:id/status`
   - `PUT /api/products/status-bulk`
2. Role bazli yetki middleware eklendi:
   - `requireRole("merkez", "admin")`
   - Urun ekleme/guncelleme/isActive islemleri sadece merkez ve admin tarafinda acik
3. Merkez urun ekrani backend'e baglandi:
   - `Frontend/merkez/merkez-urun-fiyat.html`
   - `TEST_MODE=false` iken urunler API'den cekilir
   - Yeni urun ekleme, fiyat kaydetme, tekli aktif/pasif, toplu aktif/pasif DB uzerinden calisir
   - `TEST_MODE=true` iken eski localStorage davranisi korunur (geri donus guvencesi)
4. Seed urunleri merkez ekraniyla uyumlu hale getirildi:
   - `su_boregi`, `peynirli_borek`, `kiymali_borek`, `patatesli_borek`
   - `ispanakli_borek`, `kasarli_borek`, `kol_boregi`, `karisik_borek`, `biberli_ekmek`

Teknik dosyalar:

1. `src/modules/products/products.routes.js`
2. `src/common/middlewares/require-role.js`
3. `src/app.js`
4. `prisma/seed.js`
5. `Frontend/merkez/merkez-urun-fiyat.html`

Test sonucu:

1. Login -> urun listeleme -> yeni urun ekleme -> fiyat guncelleme -> tekli durum guncelleme -> toplu durum guncelleme zinciri backend uzerinden basarili.
2. Merkez kullanicisi ile urun islemleri calisirken, yetkisiz rolde `403 FORBIDDEN` doner.

## 4.11 Adim 8 Durumu (Sube Yonetimi API + Merkez/Sube Ekran Entegrasyonu Tamamlandi)

Tamamlananlar:

1. Branches modulu endpointleri eklendi:
   - `GET /api/branches` (merkez/admin)
   - `PUT /api/branches/:id/status` (merkez/admin)
   - `PUT /api/branches/:id/price-adjustment` (merkez/admin)
   - `GET /api/branches/my-context` (sube kullanicisinin kendi sube ayarlari)
2. Merkez sube ekrani veritabanina baglandi:
   - `Frontend/merkez/merkez-subeler.html`
   - Sube listesi artik DB'deki kayitli sube kadar gorunur
   - Sube aktif/pasif ve fiyat farki kaydi API uzerinden yapilir
3. Sube siparis ekrani branch context ile uyumlu hale getirildi:
   - `Frontend/sube/siparis.html`
   - Sube aktiflik durumu ve fiyat farki DB'den okunur
   - Pasif sube siparis gonderemez
4. Seed genisletildi:
   - 5 sube (`Borekci Sube 01..05`)
   - 5 sube kullanicisi (`sube01..05@borekci.com`, sifre: `12345678`)

Teknik dosyalar:

1. `src/modules/branches/branches.routes.js`
2. `src/app.js`
3. `prisma/seed.js`
4. `Frontend/merkez/merkez-subeler.html`
5. `Frontend/sube/siparis.html`

Test sonucu:

1. Merkez login ile branch listeleme, aktif/pasif guncelleme ve fiyat farki guncelleme basarili.
2. `sube05@borekci.com` ile login sonrasi `GET /api/branches/my-context` basarili.

## 4.12 Adim 9 Durumu (Siparis API + Merkez/Sube Siparis Ekrani Entegrasyonu Tamamlandi)

Tamamlananlar:

1. Orders modulu endpointleri eklendi:
   - `POST /api/orders`
   - `GET /api/orders/my`
   - `GET /api/orders?date=YYYY-MM-DD`
   - `PUT /api/orders/:id/approve`
   - `PUT /api/orders/approve-bulk`
2. Sube siparis olusturma artik veritabanina yazar:
   - `Frontend/sube/siparis.html`
   - Siparis olusturma aninda fiyat hesaplama backend tarafinda yapilir (urun aktiflik + sube fiyat farki dahil)
3. Sube siparislerim ekrani DB'den okunur:
   - `Frontend/sube/siparislerim.html`
4. Merkez paneli siparis listesi DB'den okunur ve onaylar DB'ye yazilir:
   - `Frontend/merkez/merkez.html`
   - Tarih filtreli listeleme ve toplu onay API uzerinden calisir

Test sonucu:

1. `sube01@borekci.com` ile siparis olusturma basarili.
2. `merkez@borekci.com` ile ayni gun siparislerini listeleme basarili.
3. Merkez toplu onay sonrasi sube tarafinda siparis durumu `Onaylandi` gorunur.

## 4.13 Sonraki Adimlar (Planli Sira)

1. Adim 10 - Merkez Siparis Yonetimi (ileri durum akislari)
   - `GET /api/orders` (filtreli)
   - Durum gecisleri: `pending -> approved/rejected/preparing/shipped`
2. Adim 11 - Siparis Satir/Fiyat Hesaplama Guvencesi
   - Siparis olusturma aninda DB'deki aktif urun + fiyat snapshot
   - Branch fiyat ayari yuzdesinin siparis toplamina uygulanmasi
3. Adim 12 - Branch/Center Yonetim Ekranlari
   - Subeler ve merkez bilgileri icin CRUD endpointleri
   - Rol bazli gorunum ve yetki denetimi
4. Adim 13 - Admin Paneli Tamamlama
   - Kullanici/rol yonetimi
   - Audit log goruntuleme ve filtreleme
5. Adim 14 - Guvenlik ve Operasyon
   - Refresh token rotasyonu ve logout
   - Rate limit, request logging, merkezi hata kodlari
6. Adim 15 - Canli Oncesi Stabilizasyon
   - Otomatik testler (integration + smoke)
   - Staging UAT, deploy checklist, rollback plani

## 5. API Kontrati

- Taslak kontrat dosyasi: `Backend/api-contract/openapi.yaml`
- Frontend ve backend bu dosyaya gore paralel gelistirilir.

## 6. Canliya Hazirlik Kontrol Listesi

1. `.env` ve secret yonetimi tamamlandi.
2. Migration/seed pipeline'i otomatik.
3. Role-based yetki testleri gecti.
4. Staging ortaminda UAT tamamlandi.
5. Loglama + hata izleme aktif.
6. Backup/restore proseduru test edildi.

## 7. Uygulama Sirasi (Pratik Sprint Plani)

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

//Admin paneline geçiş yapacağız. burada kaldık. şube ve merkez tarafı sorunsuz çalışıyor database üzerinde.