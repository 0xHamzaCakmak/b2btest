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
   - Temel alanlar: `email`, `password_hash`, `role`, `branch_id`, `center_id`, `is_active`, `created_at`, `updated_at`
   - Iliski: `branch_id` ile `branches`, `center_id` ile `centers`, onaylayan kullanici olarak `orders`, islem sahibi olarak `audit_logs`.

2. `branches`
   - Amac: Sube ana kayitlari.
   - Temel alanlar: `name`, `manager`, `phone`, `email`, `address`, `center_id`, `is_active`, `created_at`, `updated_at`
   - Iliski: `users`, `orders`, `branch_price_adjustments`, `centers`.

3. `centers`
   - Amac: Merkez ana kayitlari (uretici/merkez yapisi).
   - Temel alanlar: `name`, `manager`, `phone`, `email`, `address`, `is_active`, `created_at`, `updated_at`
   - Iliski: `users` (rolu `merkez` olan kullanicilar).

4. `products`
   - Amac: Siparise konu urunlerin merkezden yonetimi.
   - Temel alanlar: `code` (unique), `name`, `base_price`, `is_active`, `created_at`, `updated_at`
   - Iliski: `order_items`.

5. `branch_price_adjustments`
   - Amac: Sube bazli fiyat farki (%).
   - Temel alanlar: `branch_id` (unique), `percent`, `created_at`, `updated_at`
   - Iliski: `branches` (1-1).

6. `orders`
   - Amac: Sube siparis baslik kaydi.
   - Temel alanlar: `order_no` (unique), `branch_id`, `status`, `delivery_date`, `delivery_time`, `note`, `total_tray`, `total_amount`, `approved_by`, `approved_at`, `created_at`, `updated_at`
   - Iliski: `branches`, `users` (onaylayan), `order_items`.

7. `order_items`
   - Amac: Siparis satir detaylari.
   - Temel alanlar: `order_id`, `product_id`, `qty_tray`, `unit_price`
   - Iliski: `orders`, `products`.

8. `audit_logs`
   - Amac: Kritik islemlerin izlenebilirlik kaydi.
   - Temel alanlar: `actor_user_id`, `action`, `entity`, `entity_id`, `before_json`, `after_json`, `meta`, `created_at`
   - Iliski: `users`.

9. `_prisma_migrations`
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

## 4.8 Adim 6 Durumu (Kullanici/Þube Gorunen Isim Bilgisi Eklendi)

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

1. Adim 15 - Admin Logs Entegrasyonu
   - `Frontend/admin/logs.html` -> audit log endpointleri
   - Tarih, actor, entity filtreleri
2. Adim 16 - Admin Dashboard Ozetleri
   - `Frontend/admin/index.html` metrik kartlarini API'den besleme
   - Kullanici/sube/urun/siparis sayaclari
3. Adim 17 - Guvenlik ve Operasyon
   - Refresh token rotasyonu ve logout
   - Rate limit, request logging, merkezi hata kodlari
4. Adim 18 - Canli Oncesi Stabilizasyon
   - Otomatik testler (integration + smoke)
   - Staging UAT, deploy checklist, rollback plani

## 4.19 Adim 15 Durumu (Admin Orders API + orders.html Entegrasyonu Tamamlandi)

Tamamlananlar:

1. Admin siparis frontend sayfasi gercek API ile baglandi:
   - `Frontend/admin/orders.html`
   - Tarih araligi filtreli siparis listeleme (`GET /api/orders?from=YYYY-MM-DD&to=YYYY-MM-DD`)
   - Tekli onay butonu (bulk endpoint uzerinden)
   - Secili siparisleri toplu onay (`PUT /api/orders/approve-bulk`)
   - Tum onay bekleyenleri onaylama
2. Ekranda operasyon metrikleri eklendi:
   - Siparis sayisi
   - Onay bekleyen sayisi
   - Onaylanan sayisi
   - Toplam tutar
3. Admin ve merkez ortak endpoint davranisi korunur:
   - Admin tum siparisleri, merkez yalniz kendi merkezine bagli siparisleri gorur.

Test sonucu:

1. Admin siparis ekraninda tarih secimiyle listeleme calisir.
2. Tekli/toplu onay sonrasi liste ve metrikler anlik guncellenir.

## 4.20 Adim 16 Durumu (Admin Logs API + logs.html Entegrasyonu Tamamlandi)

Tamamlananlar:

1. Admin logs endpointi eklendi:
   - `GET /api/admin/logs` (admin)
2. Logs endpoint filtreleri:
   - `from`, `to` (tarih araligi)
   - `action`, `entity`
   - `actorEmail`
   - `q` (serbest metin), `limit`
3. Admin logs frontend sayfasi gercek API ile baglandi:
   - `Frontend/admin/logs.html`
   - Tarih/aksiyon/entity/actor filtreleri
   - Listeleme tablosu (tarih, actor, aksiyon, entity, entity id, meta)

Test sonucu:

1. Admin login ile logs endpointi filtrelerle sorunsuz yanit verir.
2. UI filtreleri API query parametrelerine dogru sekilde yansir.

## 4.21 Sonraki Adimlar (Planli Sira)

1. Adim 17 - Admin Dashboard Ozetleri
   - `Frontend/admin/index.html` metrik kartlarini API'den besleme
   - Kullanici/sube/urun/siparis sayaclari
2. Adim 18 - Merkez-Sube Hiyerarsisi
   - Subeleri merkeze baglama (`branches.center_id`)
   - Merkez bazli sube filtreleme ve siparis raporlama
3. Adim 19 - Guvenlik ve Operasyon
   - Refresh token rotasyonu ve logout
   - Rate limit, request logging, merkezi hata kodlari
4. Adim 20 - Canli Oncesi Stabilizasyon
   - Otomatik testler (integration + smoke)
   - Staging UAT, deploy checklist, rollback plani

## 4.22 Adim 17 Durumu (Dunden Kalan Urun/Kg Akisi Eklendi)

Tamamlananlar:

1. Veritabani:
   - Yeni tablo: `order_carryovers`
   - Alanlar: `order_id`, `product_id`, `qty_kg`, `created_at`
   - Prisma modeli: `OrderCarryover`
2. Orders API:
   - `POST /api/orders` payload'ina `carryovers[]` eklendi
   - `GET /api/orders` ve `GET /api/orders/my` response'una `carryovers[]` eklendi
   - Yeni endpoint: `GET /api/orders/my/carryover-candidates`
     - Bir onceki gun siparis edilen urunleri aday liste olarak doner
3. Sube UI:
   - `Frontend/sube/siparis.html`
   - Siparisi gondermeden once modal acilir
   - Dunun urunleri listelenir, her biri icin kalan `kg` girilir (varsayilan `0`)
   - Onaydan sonra siparis + carryover birlikte kaydedilir
4. Merkez UI:
   - `Frontend/merkez/merkez.html`
   - Siparis detayinda `Elde Kalan (Dunden)` bolumu gosterilir

Test sonucu:

1. Sube siparis akisinda modal acilir ve kg girilen kayitlar DB'ye yazilir.
2. Merkez paneli ayni sipariste kalan kg bilgisini detayda gorur.

## 4.23 Adim 18 Durumu (Uretim Teslimat Onay Mekanizmasi Eklendi)

Tamamlananlar:

1. Veritabani:
   - `orders` tablosuna teslimat alanlari eklendi:
     - `delivery_status` (`TESLIM_BEKLIYOR` / `TESLIM_EDILDI`)
     - `delivered_by`
     - `delivered_at`
   - Migration: `add_order_delivery_confirmation`
2. Orders API:
   - `PUT /api/orders/:id/deliver` endpointi eklendi (`merkez`, `admin`)
   - Kural: Siparis sadece `ONAYLANDI` olduktan sonra teslim edildi olarak isaretlenebilir
   - `GET /api/orders` ve `GET /api/orders/my` response'una teslimat alanlari eklendi
3. Merkez UI:
   - `Frontend/merkez/merkez.html`
   - Siparis detayinda yeni teslimat durumu satiri
   - `Teslim Edildi Isaretle` butonu eklendi
4. Sube UI:
   - `Frontend/sube/siparislerim.html`
   - Siparis kartinda `Teslim Bekliyor` / `Teslim Edildi` gorunumu
   - Teslim edildi ise teslim zamani ve onaylayan bilgi gorunur

Test sonucu:

1. Merkez onayli siparisi teslim edildi olarak isaretleyebilir.
2. Sube ayni sipariste teslim durumunu anlik gorur.

## 4.24 Adim 19 Durumu (Urun Gorsel Altyapisi Eklendi)

Tamamlananlar:

1. Veritabani:
   - `products` tablosuna yeni alanlar eklendi:
     - `image_url`
     - `image_key`
   - Migration: `add_product_images`
2. Dosya depolama:
   - Gorseller backend tarafinda dosya olarak tutulur:
     - Klasor: `Backend/uploads/products/`
   - DB'de binary tutulmaz, sadece URL/key tutulur.
3. Products API:
   - Yeni endpoint: `POST /api/products/upload-image`
   - `POST /api/products` ve `PUT /api/products/:id` image alanlarini destekler
   - Urun silinirken bagli gorsel dosyasi da silinir
   - Urun gorseli degistirilirse eski dosya otomatik silinir
4. Frontend merkez urun ekrani:
   - `Frontend/merkez/merkez-urun-fiyat.html`
   - Yeni urun eklerken gorsel secimi
   - Mevcut urunde gorsel onizleme
   - Duzenleme modunda gorsel degistirme / mevcut resmi kaldirma

Not:

- Bu yapi canlida kolayca S3/Cloudinary benzeri storage'a adapter ile tasinabilir.

## 4.25 Guncel Kaldigimiz Nokta (17.02.2026)

Bugun tamamlananlar:

1. Merkez siparis ekraninda satir bazli onay modeli aktif edildi:
   - Siparis kalemleri tablo olarak gosteriliyor.
   - Her urun satiri ayri ayri onaylanabiliyor / onay disi birakilabiliyor.
2. Durumlar netlestirildi:
   - `Onaylandi`
   - `Kismen Onaylandi`
   - `Onaylanmadi`
3. Sube siparislerim ekraninda:
   - Onaylanmayan satirlar kirmizi ve kalin gosteriliyor.
   - Kalemler tablo duzeninde listeleniyor.
4. Merkez siparis ust aksiyon alani sadeleþtirildi:
   - Filtre ve onay islemleri ayri bloklara bolundu.
   - `Tum siparisleri sec` master checkbox mantigi eklendi.
   - `Tumunu Teslim Edildi Isaretle` butonu liste basina tasindi.
   - Teslim butonu dinamik renk:
     - Sari: teslim bekleyen var
     - Yesil: hepsi teslim edildi

Token/Oturum notu:

1. Access token suresi: `15m`
2. Refresh token suresi: `7d`
3. Su an frontend tarafinda otomatik refresh akisi yok; bu nedenle sure dolunca `token expired` gorulebilir.

Yarin ilk adim:

1. `POST /api/auth/refresh` endpointi eklemek
2. Frontend'de 401 durumunda refresh + istegi otomatik tekrar calistirma
3. Refresh de basarisizsa login'e yonlendirme

## 4.26 Adim 20 Durumu (Refresh Token Akisi Tamamlandi)

Tamamlananlar:

1. Backend refresh endpoint eklendi:
   - `POST /api/auth/refresh`
   - Payload: `refreshToken`
   - Gecerli refresh token ile yeni `accessToken` doner, refresh token `HttpOnly` cookie olarak yenilenir.
2. JWT altyapisi genisletildi:
   - `verifyRefreshToken` yardimcisi eklendi.
3. Frontend global otomatik yenileme eklendi:
   - `Frontend/assets/role-guard.js` icine fetch interceptor eklendi.
   - API isteklerinde `401` donerse otomatik refresh denenir.
   - Refresh basariliysa ayni istek yeni access token ile otomatik tekrar gonderilir.
   - Refresh basarisizsa session temizlenir ve `login.html`'e yonlendirilir.

Not:

- Bu yapi sayesinde kullanici 15 dakika access token suresi doldugunda manuel cikis/yeniden giris yapmadan devam edebilir.
- Login ve refresh endpointleri interceptor tarafinda bypass edilir (sonsuz dongu engeli).

## 4.27 Adim 21 Durumu (Telefon ile Login Destegi Eklendi)

Tamamlananlar:

1. Veritabani:
   - `users.phone` kolonu eklendi.
   - Index: `idx_users_phone`
2. Backend auth:
   - `POST /api/auth/login` artik `emailOrPhone + password` kabul eder.
   - Gecis: e-posta veya telefon ile login.
   - Login/refresh response'larina `user.phone` eklendi.
3. Backend admin users:
   - Kullanici olusturma/guncellemede `phone` destegi eklendi.
   - Telefon normalize edilir ve cakisiyorsa `PHONE_IN_USE` doner.
4. Frontend login:
   - Giris alani `E-posta / Telefon` olarak guncellendi.
   - Login payload: `{ emailOrPhone, password }`
5. Seed:
   - Demo kullanicilara telefon numaralari eklendi.

Uygulama notu:

1. Migration uygulayin:
   - `npx prisma migrate deploy` (veya gelistirmede `npx prisma migrate dev`)
2. Seed guncelleyin:
   - `npm run seed`

## 4.28 Adim 22 Durumu (Admin Profil Ekrani Eklendi)

Tamamlananlar:

1. Admin icin ayri profil sayfasi eklendi:
   - `Frontend/admin/profile.html`
2. Profil dropdown `Profili Gor` yonlendirmesi guncellendi:
   - `Frontend/assets/role-guard.js`
   - Admin artik `settings.html` yerine `profile.html` sayfasina gider.
3. Profil API guncellendi:
   - `GET /api/profile/me` user nesnesine `phone` eklendi
   - `PUT /api/profile/me` ile `telefon` alaninda user phone guncellenebilir
   - Telefon cakisiyorsa `PHONE_IN_USE` doner

Not:

- `Sistem Ayarlari` sayfasi yine ayri bir teknik/konfigurasyon alani olarak korunur.

## 4.29 Adim 23 Durumu (Sistem Ayarlari Paneli Calisir Hale Getirildi)

Tamamlananlar:

1. Veritabani:
   - Yeni tablo: `system_settings`
   - Migration: `20260218133000_add_system_settings`
2. Backend API:
   - `GET /api/admin/settings` (admin)
   - `PUT /api/admin/settings` (admin)
   - Ayarlar DB'de key/value olarak saklanir.
3. Frontend:
   - `Frontend/admin/settings.html` placeholder yerine gercek form ekranina donustu.
   - Genel ayarlar, guvenlik ayarlari ve bakim modu alanlari API ile yuklenir/kaydedilir.
4. Profil menusu:
   - Admin dropdown > `Profili Gor` zaten `admin/profile.html` ekranina yonlenir.

Not:

- Token sureleri ayar panelinde kaydedilir; runtime env degerleriyle birlikte operasyonel referans olarak kullanilir.

## 4.30 Adim 24 Durumu (Bakim Modu Runtime + Ayar Gecmisi Tamamlandi)

Tamamlananlar:

1. Runtime bakim modu middleware eklendi:
   - Dosya: `src/common/middlewares/maintenance-mode.js`
   - `system_settings` tablosundaki:
     - `maintenance_mode_enabled`
     - `maintenance_message`
     degerleri okunur.
   - Bakim modu aktifken admin disi API cagrilari `503 MAINTENANCE_MODE` alir.
2. Ayar degisiklik gecmisi endpointi eklendi:
   - `GET /api/admin/settings/history?limit=30`
   - Kaynak: `audit_logs` (`PUT_ADMIN_SETTINGS*` islemleri)
   - Donus:
     - degisiklik zamani
     - degistiren kullanici
     - degisen alanlar (key/value ozet)
3. Frontend sistem ayarlari sayfasi guncellendi:
   - `Frontend/admin/settings.html`
   - Yeni bolum: `Ayar Degisiklik Gecmisi`
   - Kaydet/yenile sonrasi gecmis listesi otomatik tazelenir.

Not:

- Bakim modu aktifken login/refresh ve admin settings rotalari bakim engelinden muaftir; boylece admin sisteme girip bakim modunu yonetebilir.

## 4.14 Adim 10 Durumu (Admin Users API + users.html Entegrasyonu Tamamlandi)

Tamamlananlar:

1. Admin users endpointleri eklendi:
   - `GET /api/admin/users`
   - `POST /api/admin/users`
   - `PUT /api/admin/users/:id`
   - `PUT /api/admin/users/:id/status`
   - `PUT /api/admin/users/:id/reset-password`
   - `GET /api/admin/users/meta/branches`
2. Admin users frontend sayfasi gercek API ile baglandi:
   - `Frontend/admin/users.html`
   - Kullanici listeleme, olusturma, secili kullanici guncelleme
   - Aktif/pasif degistirme
   - Sifre resetleme (ozel sifre veya varsayilan `12345678`)
3. Yetki:
   - Tum admin users endpointleri `admin` rolune kisitlandi.

Test sonucu:

1. Admin login ile users API akisi (create -> update -> status -> reset -> list) basarili.
2. Testte olusturulan gecici kullanici kaydi temizlendi.

## 4.15 Adim 11 Durumu (Admin Branches API + branches.html Entegrasyonu Tamamlandi)

Tamamlananlar:

1. Branches modulu admin endpointleri genisletildi:
   - `POST /api/branches` (admin)
   - `PUT /api/branches/:id` (admin)
   - Var olanlar: `GET /api/branches`, `PUT /api/branches/:id/status`, `PUT /api/branches/:id/price-adjustment`
2. Admin sube frontend sayfasi gercek API ile baglandi:
   - `Frontend/admin/branches.html`
   - Sube listeleme, yeni sube olusturma
   - Secili sube bilgisi guncelleme
   - Aktif/pasif degistirme
   - Sube bazli fiyat farki guncelleme
3. Kullanicidan once sube acma akisi netlestirildi:
   - `sube` rolu kullanici olustururken mevcut bir `branchId` secilir.

Test sonucu:

1. Admin login ile branches API akisi (create -> update -> status -> price adjustment) basarili.
2. Testte olusturulan gecici sube kaydi temizlendi.

## 4.16 Adim 12 Durumu (Admin Products API + products.html Entegrasyonu Tamamlandi)

Tamamlananlar:

1. Admin urun frontend sayfasi gercek API ile baglandi:
   - `Frontend/admin/products.html`
   - Urun listeleme (`GET /api/products`)
   - Yeni urun olusturma (`POST /api/products`)
   - Secili urun bilgi guncelleme (`PUT /api/products/:id`)
   - Secili urun aktif/pasif guncelleme (`PUT /api/products/:id/status`)
   - Toplu aktif/pasif (`PUT /api/products/status-bulk`)
   - Urun silme (`DELETE /api/products/:id`)
2. Admin urun ekraninda su kisimlar eklendi:
   - Yeni urun formu
   - Secili urun duzenleme formu
   - Urun tablosu ve satir secme akisi
3. Is akisinda yetki modeli korunur:
   - Products endpointleri sadece `merkez` ve `admin` rollerine aciktir.

Test sonucu:

1. Admin login ile urun create -> update -> status -> bulk status -> delete zinciri backend uzerinden calisir.
2. Sipariste kullanilan urun silinmeye calisildiginda API `409 PRODUCT_IN_USE` doner.

## 4.17 Adim 13 Durumu (Centers Altyapisi + Admin Centers + Merkez Kullanici Eslestirmesi Tamamlandi)

Tamamlananlar:

1. Veritabani ve migration:
   - `centers` tablosu eklendi
   - `users.center_id` kolonu eklendi
   - Index/FK eklendi: `idx_users_center_id`, `users_center_id_fkey`
2. Prisma ve seed:
   - `schema.prisma` -> `model Center` + `User.centerId`
   - `prisma/seed.js` -> varsayilan merkez (`Borekci Merkez 01`) eklendi
   - `merkez@borekci.com` kullanicisi center kaydina baglandi
3. Backend API:
   - `GET /api/centers` (admin)
   - `POST /api/centers` (admin)
   - `PUT /api/centers/:id` (admin)
   - `PUT /api/centers/:id/status` (admin)
   - `GET /api/admin/users/meta/centers` (admin)
4. Auth/session genisletmesi:
   - `POST /api/auth/login` ve `GET /api/me` response'una `centerId`, `centerName` eklendi
5. Admin UI:
   - Yeni sayfa: `Frontend/admin/centers.html`
   - Admin nav icine `Merkezler` eklendi
   - `Frontend/admin/users.html`:
     - Rol `merkez` iken merkez secimi zorunlu
     - Rol `sube` iken sube secimi zorunlu (mevcut davranis korunur)

Test sonucu:

1. Admin merkez CRUD akisi (create -> update -> status -> list) backend uzerinden calisir.
2. Admin users ekraninda `merkez` rolu kullanici olustururken center secmeden kayit engellenir.

## 4.18 Adim 14 Durumu (Sube-Merkez Eslestirmesi + Merkez Bazli Siparis Filtreleme Tamamlandi)

Tamamlananlar:

1. Veritabani ve migration:
   - `branches.center_id` kolonu eklendi
   - Index/FK eklendi: `idx_branches_center_id`, `branches_center_id_fkey`
2. Backend Branches API:
   - `POST /api/branches` icin `centerId` zorunlu hale getirildi
   - `GET /api/branches` merkez rolunde sadece kendi merkezine bagli subeleri dondurur
   - `PUT /api/branches/:id/status` ve `PUT /api/branches/:id/price-adjustment` merkez rolunde sadece kendi subeleri icin yetkilidir
3. Backend Orders API:
   - `GET /api/orders` merkez rolunde sadece kendi merkezine bagli subelerin siparislerini dondurur
   - `PUT /api/orders/:id/approve` ve `PUT /api/orders/approve-bulk` merkez rolunde center bazli yetki kontrolu ile calisir
4. Admin UI:
   - `Frontend/admin/branches.html` icine merkez secimi eklendi
   - Sube listesinde `Merkez` kolonu eklendi
5. Seed genisletmesi:
   - 2 merkez (`Borekci Merkez 01`, `Borekci Merkez 02`)
   - 10 sube (her merkeze 5 sube)
   - 2 merkez kullanicisi (`merkez@borekci.com`, `merkez2@borekci.com`)
   - 10 sube kullanicisi (`sube01..10@borekci.com`)

Test sonucu:

1. Seed sonrasi dagilim: `centers=2`, `branches=10`, `users=13`.
2. Merkez 01 ve Merkez 02 icin sube dagilimi 5-5 olarak dogrulandi.

## 5. Guvenlik ve LocalStorage Kaldirma Checklisti

Bu bolum, mevcut noktadan canliya guvenli gecis ve localStorage bagimliligini kaldirma plani icin ana referanstir.

### 5.1 Guvenlik Hardening Checklisti

1. Token storage
   - Access token'i memory'de tut.
   - Refresh token'i `HttpOnly + Secure + SameSite` cookie'ye tasi.
   - Frontend'de token localStorage kullanimini kaldir.
2. Refresh token yonetimi
   - DB'de refresh session tablosu (`jti`, `userId`, `expiresAt`, `revokedAt`, `device/ip`) olustur.
   - `/api/auth/refresh` sadece aktif session + jti ile calissin.
   - Her refresh'te rotate et: eski refresh token revoke, yenisi create.
   - `/api/auth/logout` endpointi ile refresh session revoke et.
3. CORS sikilastirma
   - `app.use(cors())` yerine whitelist kullan.
   - Ortama gore domain listesi (`DEV`, `STAGE`, `PROD`) ayir.
   - Gerekliyse credentials ayarini explicit yonet.
4. Rate limit ve brute-force korumasi
   - `POST /api/auth/login` icin IP + identifier bazli rate limit ekle.
   - Kisa sureli lockout/slowdown mekaniði ekle.
   - Basarisiz login denemelerini audit log'a yaz.
5. CSP ve guvenlik header'lari
   - Helmet CSP politikasini tanimla.
   - Inline scriptleri asamali olarak azalt.
   - `X-Content-Type-Options`, `Referrer-Policy`, `Frame-Options` ve benzeri header'lari dogrula.
6. Input ve upload guvenligi
   - Upload MIME/type/size whitelist uygula.
   - Dosya adi sanitize et.
   - Zararlý uzanti ve icerik kontrolu yap.
7. Auth/role testleri
   - Yetkisiz erisim testleri.
   - Cross-role endpoint testleri.
   - Expired/revoked token testleri.
8. Izleme ve operasyon
   - Kritik aksiyon alarmi.
   - Merkezi error monitoring.
   - Audit log dashboard filtreleri.

### 5.2 LocalStorage'i Komple Kaldirma Checklisti (Kirma Riski Olmadan)

1. Faz 0 - Yedek
   - Mevcut stabil noktayi tag'le.
   - DB backup al.
   - `.env` ve deploy config yedegini al.
2. Faz 1 - Envanter
   - Frontend'deki tum `localStorage` kullanimlarini dosya bazinda listele.
   - `TEST_MODE` ve legacy fallback noktalarini isaretle.
3. Faz 2 - Session mimarisi
   - Cookie tabanli auth akisina gec.
   - `authSession` localStorage yazimini kaldir.
   - Session bilgisini `GET /api/me` ile hydrate et.
4. Faz 3 - API istemci katmani
   - Tek bir merkezi `apiClient` olustur.
   - Tum sayfalarda dogrudan `fetch` yerine bu katmani kullan.
   - 401 -> refresh -> retry akisini cookie tabanli calistir.
5. Faz 4 - Is verisi localStorage temizligi
   - `branchOrders`, `productPrices`, `productCatalog` vb. fallbackleri kaldir.
   - Tum ekranlari yalniz backend API ile besle.
6. Faz 5 - Kod temizlik
   - Kullanilmayan `TEST_MODE` kollari ve localStorage helperlarini temizle.
   - Dokumantasyonu guncelle.
7. Faz 6 - Dogrulama
   - Login/logout/refresh e2e test.
   - Sube/merkez/admin ana akislari.
   - Token expiry ve yeni tab/hard refresh senaryolari.
8. Faz 7 - Guvenli yayin
   - Stage smoke test.
   - Kontrollu canary yayin.
   - Rollback plani hazir.

### 5.3 Uygulama Sirasinda Genel Kural

1. Once guvenlik temeli (token + cors + rate limit).
2. Sonra localStorage kaldirma (faz faz).
3. Her faz sonunda test + geri donus noktasi.

### 5.4 Guncel Durum

Tamamlanan guvenlik adimlari:

1. Cookie tabanli refresh altyapisi:
   - `POST /api/auth/login` ve `POST /api/auth/refresh` refresh token'i `HttpOnly` cookie olarak set eder.
   - `POST /api/auth/logout` refresh cookie'yi temizler.
2. Refresh token stateful yonetim:
   - Yeni tablo: `refresh_sessions` (`jti`, `user_id`, `expires_at`, `revoked_at`, `replaced_by_jti`, `ip_address`, `user_agent`).
   - Refresh akisinda jti/session kontrolu zorunlu.
   - Her refresh'te rotation uygulanir (eski session revoke, yeni session create).
3. CORS sikilastirma:
   - `app.use(cors())` yerine whitelist tabanli CORS.
   - Ortam degiskeni: `CORS_ORIGINS`.
4. Login brute-force korumasi:
   - `POST /api/auth/login` icin basit rate limiter.
5. Frontend uyumu:
   - Login/refresh/logout isteklerinde `credentials: include`.
   - Yeni loginlerde refresh token localStorage'a yazilmaz.
   - API sayfalarinda `credentials: include` aktif, token yoksa da cookie ile oturum devam eder.
6. Access token cookie fallback:
   - Backend `requireAuth` artik Bearer yoksa access cookie'den kimlik dogrular.
   - Login/refresh akisinda access token da `HttpOnly` cookie olarak set edilir.
7. Access token localStorage bagimliligi azaltildi:
   - Frontend sayfalardaki API cagrilarinda `Authorization` header zorunlulugu kaldirildi.
   - `authSession` icindeki eski `accessToken/refreshToken` alanlari otomatik temizlenir.
8. Is verisi localStorage fallbackleri kaldirildi (API-only):
   - `sube/siparis.html`: urun katalogu/fiyat/durum ve siparis kaydi artik yalniz API ile.
   - `sube/siparislerim.html`: siparis listesi yalniz API ile.
   - `merkez/merkez.html`: siparis onay/teslim ve kalan raporu yalniz API ile.
   - `merkez/merkez-urun-fiyat.html`: urun/fiyat CRUD ve aktif-pasif islemleri yalniz API ile.
   - `sube/profil.html`: profil + istatistikte business data localStorage fallbacki kaldirildi.
9. Guvenlik header sertlestirmesi (CSP + temel headerlar):
   - `helmet` CSP explicit policy ile aktif edildi (`default-src 'none'` tabanli API guvenli profil).
   - `CSP_REPORT_ONLY` env degiskeni ile policy report-only moduna alinabilir.
   - `x-powered-by` kapatildi (`app.disable('x-powered-by')`).
   - `referrer-policy: no-referrer` aktif.
10. Rate limit kapsami genisletildi:
   - Auth: `POST /api/auth/refresh`, `POST /api/auth/logout`
   - Orders: `POST /api/orders`, `PUT /api/orders/:id/approve`, `PUT /api/orders/:id/deliver`, `PUT /api/orders/approve-bulk`
   - Products: upload + tum mutating endpointler
   - Branches/Centers/Users: tum mutating endpointler
   - Profile: `PUT /api/profile/me`, `PUT /api/profile/password`
   - Settings: `PUT /api/admin/settings`
   - Logs: `GET /api/admin/logs` (okuma korumasi)
   - Limit asiminda standart `429 TOO_MANY_REQUESTS` + `Retry-After` doner.
11. Frontend session katmani localStorage'dan cikartildi:
   - `authSession` localStorage kullanimi kaldirildi.
   - Oturum bilgisi sayfa bazinda `GET /api/me` ile hydrate edilir.
   - `window.AuthSession` artik memory tabanli calisir (`get/set/clear/hydrate`).
   - Login sonrasi yonlendirme backend'den gelen role gore devam eder; oturum dogrulama cookie + `/api/me` ile yapilir.
12. Role/Auth regression test scripti eklendi:
   - Dosya: `Backend/tests/auth-regression.test.js`
   - Komut: `npm run test:auth-regression`
   - Kapsam:
     - Anonim `/api/me` -> `401`
     - Admin/Sube/Merkez login -> `200`
     - Role bazli yetki kontrolleri (`/api/admin/users` icin `403` senaryolari)
   - Refresh sonrasi `/api/me` devam ediyor mu
   - Logout sonrasi `/api/me` -> `401`
   - Sonuc ciktisi: `PASS auth-regression` veya `FAIL auth-regression`
13. Production icin distributed rate limiter gecis altyapisi hazirlandi:
   - Ortak store katmani eklendi: `Backend/src/config/rate-limit.js`
   - Varsayilan strateji: `memory` (mevcut davranis korunur)
   - Opsiyonel strateji: `redis` (`RATE_LIMIT_STRATEGY=redis`)
   - `REDIS_URL` + `RATE_LIMIT_PREFIX` env degiskenleri eklendi
   - `ioredis` yoksa veya Redis baglanamazsa otomatik memory store fallback
   - Mevcut tum limiterlar ortak store uzerinden calisir (`createSimpleRateLimiter`)
14. Frontend config sadeleþtirmesi tamamlandi:
   - Kullanilmayan `AUTH_SESSION_KEY` kaldirildi.
   - Session yonetimi tamamen `window.AuthSession` (memory + `/api/me` hydrate) uzerinden devam eder.
15. CI pipeline'a auth regression testi eklendi:
   - Workflow: `.github/workflows/backend-auth-regression.yml`
   - Tetikleme:
     - `push` ve `pull_request` (`main`, `Backend/**` degisikliklerinde)
     - manuel `workflow_dispatch`
   - Akis:
     - MSSQL service container
     - CI veritabani olusturma (`b2b_borek_ci`)
     - `prisma:generate` + `prisma:deploy` + `seed`
     - `npm run test:auth-regression`
16. Redis stratejisi icin stage hazirligi tamamlandi:
   - Fail-open rate limit store eklendi:
     - Redis erisimi kesilirse otomatik memory store fallback (servis kesintisi olusmaz).
   - Redis smoke test scripti eklendi:
     - Komut: `npm run redis:smoke`
     - Dosya: `Backend/scripts/redis-smoke.js`
     - Dogrulama: Redis connect + `SET/GET` + `INCR`
   - Env:
     - `RATE_LIMIT_STRATEGY=redis`
     - `REDIS_URL=<stage_redis_url>`
   - Not:
     - `ioredis` opsiyonel bagimlilik olarak kullanilir.
     - Redis kullanilacak ortamda bir kez `npm i ioredis` kurulmalidir.

Siradaki adim:

1. Stage ortaminda `RATE_LIMIT_STRATEGY=redis` ile deploy alip `npm run redis:smoke` ve temel login/siparis smoke testlerini calistirmak.

## 6. API Kontrati (Referans)

- Taslak kontrat dosyasi: `Backend/api-contract/openapi.yaml`
- Frontend ve backend bu dosyaya gore paralel gelistirilir.

## 7. Canliya Alma Rehberi (Uctan Uca)

Bu bolum, projeyi sifirdan production ortamina almak icin adim adim referanstir.

### 7.1 Onerilen Mimari

1. Tek VPS uzerinde:
   - `Nginx` (reverse proxy + SSL)
   - `Backend (Node.js)` (PM2 veya Docker)
   - `MSSQL` (Docker container) veya managed SQL
2. Domain:
   - `app.senin-domainin.com` -> Frontend + Backend tek domain
   - API ayni domainde `/api` path'i altinda calisir
3. SSL:
   - Let's Encrypt (`certbot`)

Not:
- Kucuk/orta trafik icin tek VPS yeterli.
- Buyume durumunda DB'yi managed servise tasimak daha saglikli olur.

### 7.2 Minimum Sunucu Gereksinimi

1. Baslangic (MVP):
   - `2 vCPU`
   - `4 GB RAM`
   - `80 GB SSD`
   - `Ubuntu 22.04 LTS`
2. Onerilen:
   - `4 vCPU`
   - `8 GB RAM`
   - `120+ GB SSD`

### 7.3 Domain ve DNS

1. Domain satin al.
2. DNS kayitlari:
   - `A` kaydi: `app` -> VPS public IP
   - (opsiyonel) `A` kaydi: `www` -> VPS public IP
3. DNS yayilimi tamamlaninca devam et.

### 7.4 Sunucu Ilk Kurulum

1. Sunucuya baglan:
   - `ssh root@<SERVER_IP>`
2. Sistem guncelle:
   - `apt update && apt upgrade -y`
3. Guvenlik duvari:
   - `ufw allow OpenSSH`
   - `ufw allow 80`
   - `ufw allow 443`
   - `ufw enable`
4. Temel paketler:
   - `apt install -y git curl ca-certificates gnupg lsb-release`

### 7.5 Runtime Kurulumu

Secenek A (onerilen): Docker ile calistir.

1. Docker + Compose kur.
2. Projeyi sunucuya cek:
   - `git clone <repo_url> app && cd app`
3. Uretim env dosyasi olustur:
   - `Backend/.env.production`

Zorunlu env ornegi:

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=sqlserver://<DB_HOST>:1433;database=<DB_NAME>;user=<DB_USER>;password=<DB_PASS>;trustServerCertificate=true
JWT_ACCESS_SECRET=<STRONG_SECRET>
JWT_REFRESH_SECRET=<STRONG_SECRET>
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=7
CORS_ORIGINS=https://app.senin-domainin.com
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
ACCESS_COOKIE_NAME=access_token
REFRESH_COOKIE_NAME=refresh_token
RATE_LIMIT_STRATEGY=memory
CSP_REPORT_ONLY=false
```

### 7.6 Veritabani Stratejisi

1. Secenek A: MSSQL Docker (hizli baslangic)
   - Avantaj: tek sunucuda kolay kurulum
   - Dezavantaj: backup/upgrade sorumlulugu sende
2. Secenek B: Managed SQL (onerilen uzun vadede)
   - Avantaj: backup, HA, izleme daha kolay
   - Dezavantaj: maliyet biraz daha yuksek

### 7.7 Backend Deploy Adimlari

1. `cd Backend`
2. Paketler:
   - `npm ci`
3. Prisma:
   - `npx prisma generate`
   - `npx prisma migrate deploy`
4. Ilk veri (gerekirse):
   - `npm run seed`
5. Uygulama calistir:
   - Docker veya PM2 ile `node src/server.js`

### 7.8 Nginx Reverse Proxy

Nginx mantigi:
1. `/api` -> `http://127.0.0.1:4000`
2. `/uploads` -> `http://127.0.0.1:4000/uploads`
3. `/` -> frontend statik dosyalari (`Frontend/`)

Canliya cikmadan once:
1. `nginx -t`
2. `systemctl reload nginx`

### 7.9 SSL (Let's Encrypt)

1. Certbot kur:
   - `apt install -y certbot python3-certbot-nginx`
2. Sertifika al:
   - `certbot --nginx -d app.senin-domainin.com`
3. Otomatik yenileme:
   - `systemctl status certbot.timer`

### 7.10 Canli Oncesi Kontrol

1. Health:
   - `GET /health` -> `ok: true`
2. Auth regression:
   - `npm run test:auth-regression`
3. Manuel smoke:
   - Admin login
   - Merkez login + siparis onay
   - Sube login + siparis olusturma
4. Cookie kontrol:
   - `Secure + HttpOnly` aktif

### 7.11 Yedekleme ve Izleme

1. DB backup:
   - Gunluk otomatik backup
   - En az 7 gun saklama
2. Uygulama log:
   - `pm2 logs` veya container log toplama
3. Hata izleme:
   - Opsiyonel Sentry/benzeri

### 7.12 Rollback Plani

1. Her deploy oncesi:
   - Git tag (`release-YYYYMMDD-HHMM`)
2. Hata durumunda:
   - Onceki tag'e don
   - DB migration rollback gerekiyorsa yedekten don
3. Rollback smoke:
   - Login + siparis + admin temel akislari tekrar test et

### 7.13 Redis Ne Zaman Acilmali?

1. Simdilik `memory` ile devam edebilirsin.
2. Asagidaki durumda Redis'e gec:
   - Birden fazla backend instance
   - Trafik artisi
   - Tutarli dagitik rate limit ihtiyaci
3. Gecis adimlari:
   - `RATE_LIMIT_STRATEGY=redis`
   - `REDIS_URL` tanimla
   - `npm i ioredis`
   - `npm run redis:smoke`

## 8. En Altta Kalan Not (Redis)

- Redis gecisi simdilik ertelendi; sistem su an `RATE_LIMIT_STRATEGY=memory` ile stabil calisir.
- Redis zorunlu degil, performans ve dagitik ortam avantaji icin planli iyilestirmedir.
- Redis'e gecis zamani geldiginde kontrol listesi:
  1. `RATE_LIMIT_STRATEGY=redis`
  2. `REDIS_URL` tanimla
  3. `npm i ioredis`
  4. `npm run redis:smoke`
  5. Login + siparis + admin smoke testleri
