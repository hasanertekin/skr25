# Şükür Günlüğü — Bütünsel Tasarım Sistemi Planı

## Marka yönü

**Editorial luxury wellness:** sıcak fildişi zemin, koyu zeytin yeşili ana vurgu, şampanya tonlu ikincil vurgu, Playfair Display başlıkları ve Open Sans gövde metinleri.

## Uygulama kontrol listesi

1. **Tema tokenları:** spacing, radius, typography, elevation, button heights ve ortak renkleri `lib/design-tokens.ts` altında merkezileştir.
2. **Ortak ekran başlığı:** Günlük, Geçmiş, Listeler, Profil ve detay ekranlarında aynı eyebrow–title–intro hiyerarşisini kullan.
3. **Ortak kart kabuğu:** Günlük, geçmiş, playlist, klasör ve profil kartlarında aynı radius, border, padding ve gölge dilini kullan.
4. **Ortak kayıt kartı:** Günlük, geçmiş arama, tarih detayı ve playlist detayında aynı medya/oynatma/metin hiyerarşisini kullan.
5. **Geçmiş gün grupları:** gün başlığı, tarih, sayaç, ayraç ve kayıt listelerini tek bir kalıba taşı.
6. **Kütüphane kartları:** klasör ve playlist kartlarını aynı yükseklik, kapak alanı, metin ve dokunma davranışıyla birleştir.
7. **Detay hero alanı:** klasör ve playlist detaylarında geniş kapak/gradient ve ortak üst aksiyon düzenini kullan.
8. **Buton/ikon sistemi:** primary, secondary ve icon-button seviyelerini standartlaştır; tüm ekranlarda aynı ölçüleri kullan.
9. **Boş durumlar:** günlük, geçmiş, playlist, klasör ve arama için ortak `EmptyState` bileşeni kullan.
10. **Hareket dili:** pressed, modal, kart giriş ve aktif oynatma animasyonlarını aynı süre/easing değerleriyle standardize et.

## Sıralı uygulama

- [x] Marka paleti ve font yönü belirlendi.
- [x] Token ve ortak UI bileşenleri oluşturuldu (`design-tokens`, `ScreenHeader`, `EmptyState`, `SectionHeader`, `IconButton`, ortak kayıt kartı).
- [x] Tema paletleri premium kimliğe taşındı; tüm renk varyasyonları sıcak fildişi/zeytin ekseninde tutuldu.
- [x] Günlük, geçmiş, tarih detayı ve normal playlist görünümü ortak kayıt kartına taşındı; sürükleme modu korundu.
- [x] Klasör kartları yatay kapak thumbnail’ına ve klasör detayları gradient hero alanına taşındı.
- [x] Günlük, Geçmiş, Listeler ve Profil ortak ekran başlığına; geçmiş/listeler/tarih detayı ortak boş duruma taşındı.
- [x] Ortak kart ve ikon buton ölçüleri ile pressed hareket tokenları eklendi; Android export, TypeScript, lint ve diff kontrolleri başarıyla tamamlandı.
