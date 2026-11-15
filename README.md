# Rüzgârın İzi

Tarayıcıda çalışan, Three.js tabanlı serbest sürüş ve at bakımı yaşam simülasyonu. Sağlanan **Cabin in the Woods** şablonunun sonbahar vadisi, arazi yükseklikleri ve bitki yerleşimi korunarak WebGL üzerinde yeniden kuruldu.

## Oynanış

- Atla serbest sürüş: W/S hız, A/D yön, Shift dörtnal, Space küçük sıçrama.
- Yürüyüş: R ile in/bin; uzaktaysa H ile atı çağır.
- Bakım: yemlik, yalak ve tarama noktasında E ile etkileşim.
- Keşif: Ayna Gölü, Gözcü Kulesi ve Çiçekli Çayır.
- Yaşam döngüsü: enerji, yem, su ve bakım ihtiyaçları; bağlılık; gün sonu özeti ve yeni gün.
- Kamera: fareyle sürükle, tekerlekle yakınlaş. Dokunmatik cihazlarda ekran düğmeleri.
- Duraklatma menüsünde yağmur, gün döngüsü, saat ve kalite ayarları.

## Çalıştırma

```sh
npm install
npm run dev
```

Vite'ın gösterdiği yerel adresi aç. Üretim için:

```sh
npm run build
npm run preview
```

`dist/` klasörü herhangi bir statik HTTP sunucusunda çalışır. `file://` yerine HTTP kullan. Hesap, API, veritabanı veya ücretli servis gerekmez. Gün, bağlılık ve ayarlar yalnızca geçerli tarayıcının `localStorage` alanında tutulur; cihazlar arasında eşitlenmez ve tarayıcı verileri silinirse kaybolur.

## Teknik yapı

- `src/game/engine.ts`: sabit adımlı oyun döngüsü, kontroller, ihtiyaçlar, görevler, kamera ve çarpışmalar.
- `src/game/world.ts`: arazi örnekleme, göl, yapılar, örneklenmiş bitkiler, hava ve parçacıklar.
- `src/game/horse.ts`: animasyonlu at, eyer ve kodla üretilmiş binici.
- `src/game/audio.ts`: Web Audio ile sentezlenmiş ambiyans ve toynak sesleri.
- `src/pages/Home.tsx` ve `src/App.css`: HUD, menüler, mini harita ve dokunmatik kontroller.

Kaynak ve lisans bilgileri için `CREDITS.md` dosyasına bak.
