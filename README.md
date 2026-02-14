# B2B Borek Siparis Sistemi (Frontend Prototype)

Bu proje, **sube - merkez** arasindaki gunluk tepsi bazli siparis surecini modelleyen bir prototiptir.  
Su an veriler tarayici tarafinda `localStorage` ile tutulur. Sonraki adimda backend + veritabani ile gercek sisteme tasinmasi hedeflenir.

## 1. Proje Amaci

- Subelerin borek siparisi verebilmesi
- Merkezin gelen siparisleri gormesi ve onaylamasi
- Merkezin global fiyat belirleyebilmesi
- Merkezin yeni urun ekleyebilmesi
- Merkezin urunleri aktif/pasif yonetebilmesi
- Merkezin sube bazli fiyat farki (+/- %) uygulayabilmesi
- Pasif subelerin siparis gonderiminin engellenmesi

## 2. Sayfalar ve Roller

## 2.1 `index.html`
- Giris oncesi acilis/landing sayfasi.
- `Projeye Basla` -> `login.html`.

## 2.2 `login.html`
- Giris formu (demo).
- Giris sonrasi `siparis.html` acilir.
- Bu asamada rol kisiti yok (admin hepsini gorebilir varsayimi).

## 2.3 `siparis.html` (Sube Siparis Ekrani)
- Sube urunleri tepsi adediyle girer.
- Teslimat tarihi varsayilan: **yarin**.
- Teslimat saati varsayilan: **07:00**.
- Sepet tutari canli hesaplanir.
- Siparis `branchOrders` kaydina yazilir.
- Durum ilk kayitta: `Onay Bekliyor`.
- Sube pasifse siparis engellenir ve kirmizi hata mesaji gosterilir:
  - `Bu siparis gerceklestirilemiyor. Lutfen merkez ile irtibata gecin.`

## 2.4 `siparislerim.html` (Sube Siparis Gecmisi)
- Subenin verdigi siparisleri listeler.
- Durum rozetleri:
  - `Onay Bekliyor`
  - `Onaylandi`
- Merkez onayi geldikce durumlar guncellenir.

## 2.5 `profil.html` (Sube Profil)
- Sube profil bilgilerini goruntuleme/guncelleme:
  - Sube adi, yetkili, telefon, e-posta, adres
- Siparis ozet istatistikleri:
  - Toplam siparis, toplam tepsi, toplam tutar

## 2.6 `merkez.html` (Merkez Gelen Siparis Paneli)
- Bugunun siparislerini listeler.
- Her sipariste disardan durum gorunur:
  - `Onay Bekliyor` / `Onaylandi`
- Toplu islem:
  - Tumunu sec
  - Secilenleri onayla
  - Tum siparisleri onayla
- Detaya girince:
  - Siparis kalemleri, tutar, not, sube gunluk toplami
- Alt bolum:
  - **Total Uretim Ihtiyaci (Tepsi)** (urun bazli toplamlar)

## 2.7 `merkez-urun-fiyat.html` (Merkez Urunler ve Fiyat)
- Urunlerin baz tepsi fiyatlari guncellenir.
- Yeni urun eklenebilir (ad + baslangic fiyat).
- Urun bazinda aktif/pasif secimi yapilabilir.
- Toplu aksiyonlar:
  - `Tumunu Aktif Yap`
  - `Tumunu Pasif Yap`
- Kaydedilen urun/fiyat/durum bilgileri subelerin siparis ekranina yansir.

## 2.8 `merkez-subeler.html` (Merkez Sube Yonetimi)
- 20 sube liste halinde gorunur.
- Sube secince profil detaylari gorunur.
- Sube bazli fiyat farki uygulanir:
  - `%` olarak + / - deger
  - Kaydedilince sadece o subeye yansir
- Sube aktif/pasif yonetimi:
  - `Aktif Yap`
  - `Pasif Yap`

## 3. Uygulama Akisi (Adim Adim)

1. Kullanici `index.html` -> `login.html` gelir.
2. Giris sonrasi `siparis.html` acilir.
3. Sube siparis verir, kayit `branchOrders`'a gider.
4. Merkez `merkez.html` ekraninda siparisleri gorur.
5. Merkez siparisi tekli/toplu onaylar.
6. Sube `siparislerim.html` ekraninda onay durumunu gorur.
7. Merkez `merkez-urun-fiyat.html` ile urun ekler, fiyat gunceller ve urunleri aktif/pasif yonetir.
8. Sube `siparis.html` ekraninda tum urunleri gorur; pasif urunler gorunur ancak siparise kapalidir.
9. Pasif urune adet girilerek siparis verilmek istenirse siparis engellenir ve su mesaj gosterilir:
   - `Bu urun tedariki su anda saglanamiyor.`
10. Merkez `merkez-subeler.html` ile subeye ozel % fiyat farki veya aktif/pasif durumu verir.
11. Pasif sube siparis gondermeye calisirsa sistem engeller.

## 4. Kullanilan Veri Anahtarlari (`localStorage`)

## 4.1 `branchProfile`
Sube profil bilgileri.

Ornek:
```json
{
  "subeAdi": "Borekci Sube 01",
  "yetkili": "Ahmet Yilmaz",
  "telefon": "0555 123 45 67",
  "eposta": "sube01@ornek.com",
  "adres": "Ornek Mah. Borek Cad. No:12"
}
```

## 4.2 `branchOrders`
Subenin verdigi siparis kayitlari.

Ornek:
```json
[
  {
    "orderNo": "SP-0001",
    "branchName": "Borekci Sube 01",
    "status": "Onay Bekliyor",
    "deliveryDate": "2026-02-14",
    "deliveryTime": "07:00",
    "note": "Sabah sevkiyatina dahil edin.",
    "totalTray": 12,
    "totalAmount": 8450,
    "items": [
      { "name": "Su Boregi", "qty": 5, "unitPrice": 700 },
      { "name": "Karisik Borek", "qty": 7, "unitPrice": 790 }
    ],
    "createdAt": "2026-02-13T18:20:00.000Z"
  }
]
```

## 4.3 `productPrices`
Merkezin belirledigi global urun fiyatlari.

## 4.4 `productCatalog`
Urun anahtar -> urun gorunen ad haritasi.

Ornek:
```json
{
  "su_boregi": "Su Boregi",
  "peynirli_borek": "Peynirli Borek",
  "pogaca": "Pogaca"
}
```

## 4.5 `productAvailability`
Urunlerin aktif/pasif durumu.

Ornek:
```json
{
  "su_boregi": true,
  "peynirli_borek": true,
  "pogaca": false
}
```

## 4.6 `branchPriceAdjustments`
Sube bazli fiyat farklari (%).

Ornek:
```json
{
  "Borekci Sube 01": 5,
  "Borekci Sube 02": -3
}
```

## 4.7 `centerBranches`
Merkezin yonettigi sube listesi + aktif/pasif durumu.

Ornek:
```json
[
  {
    "name": "Borekci Sube 01",
    "manager": "Yetkili 01",
    "phone": "0555 100 01 01",
    "email": "sube01@ornek.com",
    "address": "Ornek Mah. Borek Sok. No:1",
    "active": true
  }
]
```

## 5. Fiyat Hesaplama Mantigi

1. Merkezden gelen global fiyat (`productPrices`) okunur.
2. Aktif sube icin `%` fark (`branchPriceAdjustments[branchName]`) okunur.
3. Urun birim fiyati su formulle hesaplanir:
   - `adjusted = base * (1 + percent / 100)`
4. Sonuc yuvarlanir ve en az `1` olacak sekilde uygulanir.

## 6. Aktif/Pasif Sube Davranisi

- `centerBranches.active = false` olan sube:
  - Panele girebilir
  - Siparis ekranini gorebilir
  - Ancak siparis gonderemez
- Gonderim denemesinde kirmizi hata mesaji alir.

## 6.1 Aktif/Pasif Urun Davranisi

- Tum urunler sube siparis ekraninda listelenir.
- `productAvailability[productKey] = false` olan urun:
  - Gorsel olarak `Pasif - Tedarik Saglanamiyor` etiketiyle gorunur.
  - Sepete eklenmek istenirse siparis gonderimi engellenir.
  - Uyari metni: `Bu urun tedariki su anda saglanamiyor.`

## 7. Mevcut Sinirlar (Prototype)

- Gercek kimlik dogrulama yok.
- Rol kontrolu sayfa bazli kesinlestirilmedi.
- Veri kaliciligi sadece tarayiciya bagli.
- Cok kullanicili eszamanli senaryo backend olmadan sinirlidir.

## 8. Veritabanina Gecis Icin Oneri

Asagidaki temel tablolarla baslanabilir:

1. `users`
   - `id`, `email`, `password_hash`, `role` (`sube`, `merkez`, `admin`), `branch_id`
2. `branches`
   - `id`, `name`, `manager`, `phone`, `email`, `address`, `is_active`
3. `products`
   - `id`, `code`, `name`, `base_price`, `is_active`, `created_at`, `updated_at`
4. `branch_price_adjustments`
   - `id`, `branch_id`, `percent`
5. `orders`
   - `id`, `order_no`, `branch_id`, `status`, `delivery_date`, `delivery_time`, `note`, `total_tray`, `total_amount`, `created_at`
6. `order_items`
   - `id`, `order_id`, `product_id`, `qty_tray`, `unit_price`

## 9. API Taslagi (Oneri)

1. `POST /auth/login`
2. `GET /me`
3. `GET /branches/:id/profile` / `PUT /branches/:id/profile`
4. `GET /products` (sube+merkez, aktif/pasif bilgisi dahil)
5. `POST /products` (merkez, yeni urun)
6. `PUT /products/:id` (merkez, ad/fiyat guncelleme)
7. `PUT /products/:id/status` (merkez, aktif/pasif)
8. `PUT /products/status-bulk` (merkez, tumunu aktif/pasif)
9. `PUT /branches/:id/price-adjustment` (merkez)
10. `PUT /branches/:id/status` (aktif/pasif, merkez)
11. `POST /orders` (pasif urun kontrolu backend tarafinda da zorunlu)
12. `GET /orders?branch_id=...` (sube)
13. `GET /orders?date=today` (merkez)
14. `PUT /orders/:id/approve`
15. `PUT /orders/approve-bulk`

## 10. Test Senaryolari (Kisa Checklist)

1. Sube girisi yap -> siparis ver -> merkezde gorunuyor mu?
2. Merkez onay ver -> subede durum `Onaylandi` oluyor mu?
3. Merkez global fiyat degistir -> sube siparis ekraninda fiyat degisiyor mu?
4. Merkez yeni urun ekle -> sube siparis ekraninda urun gorunuyor mu?
5. Merkez urunu pasif yap -> sube urunu goruyor ama siparis veremiyor mu?
6. Merkez tumunu pasif yap -> hicbir urunden siparis gonderilemiyor mu?
7. Merkez tumunu aktif yap -> urunlerden tekrar siparis verilebiliyor mu?
8. Sube bazli +/-% uygula -> sadece o subede fiyat farki dogru mu?
9. Sube pasif yap -> siparis gonderimi engelleniyor mu?

## 11. Backend Gecis Yol Haritasi (ASP.NET Core + MSSQL + Code First)

Bu adimlar, localStorage prototipini backend API mimarisina sorunsuz tasimak icin onerilen sira ile verilmistir.

1. Proje iskeleti
   - `ASP.NET Core Web API` projesi olustur.
   - Katmanlari ayir: `Api`, `Application`, `Domain`, `Infrastructure`.
   - Ortak hata/sonuc modeli ve global exception middleware ekle.

2. Kimlik dogrulama ve rol modeli
   - `users`, `roles`, `user_roles` (veya ASP.NET Identity) yapisini kur.
   - JWT tabanli giris/cikis akisini ekle.
   - Roller: `sube`, `merkez`, `admin`.

3. Domain modelleri ve Code First
   - Entity siniflarini tanimla: `Branch`, `Product`, `BranchPriceAdjustment`, `Order`, `OrderItem`, `User`.
   - `Product` icin `code`, `name`, `base_price`, `is_active` alanlarini zorunlu tut.
   - `OrderItem` icin siparis anindaki birim fiyati (`unit_price`) sakla.

4. EF Core konfigurasyonu
   - `DbContext`, entity configuration (Fluent API), iliskiler ve kisitlar.
   - Indexler:
     - `orders.order_no` (unique)
     - `orders.branch_id`
     - `orders.created_at`
     - `products.code` (unique)

5. Migration ve seed
   - Ilk migration olustur ve MSSQL'e uygula.
   - Cekirdek verileri seed et:
     - Varsayilan urunler
     - Ornek subeler
     - Roller ve test kullanicilari

6. Urun API'si (merkez)
   - `GET /products`
   - `POST /products`
   - `PUT /products/:id`
   - `PUT /products/:id/status`
   - `PUT /products/status-bulk`
   - Kural: pasif urun siparise dahil edilemez.

7. Sube ve fiyat farki API'si
   - `PUT /branches/:id/status`
   - `PUT /branches/:id/price-adjustment`
   - Kural: pasif sube siparis gonderemez.

8. Siparis API'si
   - `POST /orders`, `GET /orders?branch_id=...`, `GET /orders?date=today`
   - `PUT /orders/:id/approve`, `PUT /orders/approve-bulk`
   - Siparis olusturma aninda backend dogrulamalari:
     - Sube aktif mi?
     - Urun aktif mi?
     - Fiyat hesaplamasi dogru mu? (global + sube yuzdesi)

9. Is kurallari servis katmani
   - Fiyat hesaplama ve aktif/pasif kontrollerini tek bir domain/application servisinde topla.
   - Frontend'e guvenme; tum kritik validasyon backend'de tekrar calissin.

10. Test ve kalite
   - Unit test: fiyat hesaplama, durum gecisleri, aktif/pasif kurallari.
   - Integration test: temel API akislari.
   - Swagger/OpenAPI dokumani ve ornek request/response'lar.
   - Logging, audit alanlari (`created_by`, `updated_by`) ve temel izleme.

11. Frontend entegrasyon gecisi
   - LocalStorage okuma/yazmalarini asamali olarak API cagrilarina cevir.
   - Ilk etapta yalniz urun/fiyat modulu, sonra siparis modulu tasinabilir.
   - Geriye uyumluluk icin gecici feature flag veya adaptor katmani kullan.

---

Bu README, backend/veritabani tasarimina gecmeden once mevcut isleyisin tek referans noktasi olarak kullanilabilir.
