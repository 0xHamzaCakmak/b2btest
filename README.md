# B2B Tedarik Platformu

Merkez, sube ve admin rollerine sahip; siparis, fiyat ve operasyon yonetimi odakli B2B tedarik uygulamasi.

## Features
- Rol bazli erisim: `sube`, `merkez`, `admin`
- Sube tarafi:
  - Siparis olusturma
  - Siparis gecmisi goruntuleme
  - Profil ve hesap ayarlari
- Merkez tarafi:
  - Gunluk siparis operasyonu (onay/reddet/teslim)
  - Urun ve fiyat yonetimi
  - Sube bazli fiyat farki yonetimi
  - Raporlar (kalan stok, gecmis siparis, urun bazli toplam, sube bazli toplam)
- Admin paneli:
  - Kullanici/rol yonetimi
  - Sube/merkez yonetimi
  - Urun/siparis/log/sistem ayarlari
- Backend API:
  - Node.js + Express
  - Prisma ORM + MySQL
  - JWT tabanli kimlik dogrulama

## Tech Stack
- Frontend: Vanilla HTML/CSS/JS (`Frontend/`)
- Backend: Node.js + Express (`Backend/`)
- Database: MySQL
- ORM: Prisma

## Project Structure
```text
Frontend/
  admin/
  merkez/
  sube/
  assets/
Backend/
  src/
  prisma/
  tests/
index.html
README.md
```

## Getting Started (Local)

### 1) Backend
```bash
cd Backend
npm install
npm run prisma:generate
npm run prisma:deploy
npm run seed
npm run dev
```

Backend default URL: `http://localhost:4000`

### 2) Frontend
Frontend dosyalarini bir static server ile acin (VS Code Live Server vb.).

Giris:
- `http://127.0.0.1:5500/Frontend/login.html`
- veya root redirect: `http://localhost:<frontend-port>/`

## Environment Variables
`Backend/.env` icinde en az su degerler olmalidir:
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `RATE_LIMIT_STRATEGY` (`memory` veya `redis`)
- `REDIS_URL` (opsiyonel)

> Guvenlik notu: README icinde gercek secret, token, sifre veya sunucu bilgisi paylasilmaz.

## Multi-tenant Product Isolation
- `products` artik `center_id` ile merkeze baglidir.
- `products.unit` alani eklendi (`TEPSI`, `ADET`, `KG`, `PALET`).
- Her urun sadece tek bir merkeze aittir; center bazli unique kurallari:
  - `(center_id, code)`
  - `(center_id, name)`
- `GET /api/products` rol bazli izolasyon uygular:
  - `admin`: tum urunler, opsiyonel `?centerId=...` filtresi
  - `merkez`: sadece kendi merkezi
  - `sube`: bagli oldugu subenin merkezi
- Product CRUD (`POST/PUT/DELETE/status`) center izolasyonludur; merkez disi urun id'sinde `403` doner.
- Urun olusturma/guncellemede birim secimi urun bazlidir (her urun farkli birim olabilir).
- Siparis olusturma ve sube context urun listesi de center bazli filtrelenir.
- Migration/backfill:
  - Eski global urunler `Default Center` altina tasinir.
  - `Backend/prisma/migrations/20260305143000_product_center_isolation/migration.sql`
- Ek test:
  - `npm run test:product-isolation`

## API (High Level)
- Auth: `/api/auth/*`
- Profile: `/api/profile/*`
- Orders: `/api/orders/*`
- Products: `/api/products/*`
- Branches: `/api/branches/*`
- Centers: `/api/centers/*`
- Admin: `/api/admin/*`

## Screenshots
Asagidaki klasore ekran goruntuleri ekleyebilirsin:
- `docs/screenshots/`

Ornek liste:
- Login
- Sube Siparis Ekrani
- Merkez Paneli
- Merkez Raporlar
- Admin Dashboard

## Deployment (Summary)
- Frontend ve backend ayri servis olarak yayinlanir.
- Frontend static hosting ile sunulur.
- Backend API, MySQL ile ayni private network/VPC uzerinde calisir.
- Reverse proxy ile tek domain routing yapilabilir.
- HTTPS zorunlu olmalidir.

## Roadmap
- [ ] Raporlarda export (CSV/Excel)
- [ ] Bildirim altyapisi (mail/push)
- [ ] Ileri seviye rol/yetki matrisi
- [ ] Redis ile dagitik rate-limit
- [ ] E2E test ve release pipeline guclendirme

## Security Notes
- Frontend tarafinda secret tutulmaz.
- Tum kritik kurallar backend tarafinda uygulanir.
- Production ortaminda CORS, cookie, TLS ve firewall politikalari zorunlu olarak sikilastirilmalidir.

## Legacy Docs
Eski detayli teknik notlar:
- `docs/archive/README-legacy-root.md`
- `docs/archive/README-legacy-backend.md`

## License
Bu proje icin lisans secimi henuz yapilmamistir.
Uygun lisans secildiginde bu bolum guncellenecektir.
