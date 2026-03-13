# MVP2 Yol Haritasi

Bu dosya, mevcut merkez-sube siparis sistemini kontrollu sekilde genel ve cok sektorlu bir yapiya tasimak icin calisma checklist'idir. Oncelik, calisan sistemi bozmadan frontend gorunumunu hizlica neutral hale getirmektir.

## Faz 1 - Hizli Gorunum Duzeltmesi

- [x] Frontend icinde sektor bagimli gorunen metinleri tespit et
- [x] Sube siparis sayfasindaki panel basligini genel isme cevir
- [x] Sube siparis sayfasindaki aciklama metnini neutral hale getir
- [x] `Siparis Ver` metnini `Siparis Olustur` olarak guncelle
- [x] `Siparislerim` metnini `Siparis Gecmisi` olarak guncelle
- [x] `Merkeze Not` alanini `Siparis Notu` olarak guncelle
- [x] Siparis gonderme butonunu daha genel metne cevir
- [x] Sube profil fallback display name icindeki sektor adini kaldir
- [x] Sube profil fallback sube adini neutral hale getir
- [x] Merkez-sube yonetimi fallback ornek sube isimlerini neutral hale getir
- [x] Ornek e-posta ve adres fallback metinlerini neutral hale getir
- [ ] Mobil gorunumde header/nav tasmasini manuel kontrol et
- [ ] Faz 1 degisikliklerini tarayici uzerinde sayfa sayfa dogrula

## Faz 2 - Frontend Metinlerini Ortaklastirma

- [ ] Ortak bir `Frontend/assets/ui-text.js` dosyasi olustur
- [ ] Header, nav, buton ve placeholder metinlerini ortak config'ten besle
- [ ] Sayfa bazli text key yapisi tanimla
- [ ] `document.title` degerlerini ortak text yapisina bagla
- [ ] Varsayilan fallback text seti tanimla
- [ ] UI text kullanan alanlarda null/fallback kontrolu ekle

## Faz 3 - MVP2 Hazirlik Katmani

- [ ] `center_settings` veri modelini netlestir
- [ ] `product_units` yapisinin tablo mu enum mu olacagina karar ver
- [ ] `GET /api/me/ui-config` endpoint kontratini tasarla
- [ ] `panelTitle`, `panelSubtitle`, `branchLabel`, `orderButtonText`, `notesPlaceholder` alanlarini standartlastir
- [ ] Frontend tarafinda hafif bir global UI config state yapisi planla
- [ ] Feature flag gerekiyorsa rollout stratejisini belirle

## Faz 4 - Backend Altyapi

- [ ] Prisma `center_settings` migration'ini ekle
- [ ] Prisma `product_units` migration'ini ekle
- [ ] `GET /api/center-settings/current` endpoint'ini ekle
- [ ] `PUT /api/center-settings/:centerId` endpoint'ini ekle
- [ ] `GET /api/me/ui-config` endpoint'ini ekle
- [ ] Merkez yetkilisinin sadece kendi center settings kaydini guncelleyebildigini dogrula
- [ ] UI config icin backend fallback degerleri tanimla

## Faz 5 - Frontend Dinamik UI Config

- [ ] Login sonrasi UI config istegini yap
- [ ] UI config yuklenene kadar loading state goster
- [ ] UI config hatalarinda local fallback text setine don
- [ ] Baslik, alt aciklama, buton, placeholder ve branch label alanlarini dinamik bagla
- [ ] `document.title` degerlerini merkez bazli hale getir
- [ ] Logo alani icin bos/fallback durumlarini ekle

## Faz 6 - White-Label Baslangici

- [ ] `primaryColor`, `secondaryColor`, `accentColor` alanlarini CSS variable'lara bagla
- [ ] `logoUrl` ve `faviconUrl` alanlarini arayuze bagla
- [ ] `businessType` bazli varsayilan text preset mantigi ekle
- [ ] Merkez bazli panel basligi ve alt aciklamayi runtime'da uygula
- [ ] White-label acik/kapali davranisini `isWhiteLabelEnabled` ile yonet

## Faz 7 - Admin / Merkez Ayarlar Ekrani

- [ ] Merkez panelinde `Kurumsal Ayarlar` bolumu ac
- [ ] Panel adi, alt aciklama, logo, renk ve not placeholder alanlarini duzenlenebilir yap
- [ ] Business type alanini secilebilir yap
- [ ] Ayar kaydetme sonrasi basarili/hata durumlarini goster
- [ ] Ayar degisikligi audit log ihtiyacini degerlendir

## Faz 8 - Urun Birimi Genisletmesi

- [ ] Urun birim listesini merkezden bagimsiz yonetilebilir hale getir
- [ ] `Miktar (birim)` label uretimini dinamik hale getir
- [ ] Eski kayitlarla yeni birim yapisi arasindaki mapping'i planla
- [ ] Admin panelde birim yonetimi gerekiyorsa ayri gorev olarak ac

## Risk Notlari

- Faz 1: Dusuk risk. Sadece gorunen metinler ve fallback degerler degisiyor.
- Faz 2: Dusuk risk. Text source ortaklasiyor, davranis degismiyor.
- Faz 3: Dusuk-orta risk. Kontrat tasarimi yanlis kurulursa ileride tekrar is cikar.
- Faz 4: Orta risk. Migration ve authorization dikkat istiyor.
- Faz 5: Orta risk. UI config fallback'leri eksik olursa bazi ekranlar bos metin gosterebilir.
- Faz 6: Orta risk. Tema ve logo degisiklikleri gorsel regressions uretebilir.
- Faz 7: Orta risk. Yetki ve veri dogrulama eksigi canli sistemi etkileyebilir.
- Faz 8: Orta-yuksek risk. Product unit gecisi eski veriyle uyumlu tasarlanmazsa siparis akisini etkileyebilir.

## En Guvenli Uygulama Sirasi

1. Faz 1 degisikliklerini gozden gecir ve onayla
2. Ortak UI text dosyasini ekle
3. `center_settings` ve `ui-config` backend kontratini netlestir
4. Migration ve endpoint katmanini ekle
5. Frontend'i dinamik config'ten besle
6. Logo ve renk ozellestirmesini bagla
7. Product units genisletmesini ayri bir teslim olarak uygula
