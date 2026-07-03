# Zip to PDF PWA

iPhone Safari'de calisan statik PWA. Zip icindeki ilk HTML faturayi bulur, cihazda render eder ve PDF olarak paylastirir veya indirir.

## Yerelde calistirma

```sh
python3 -m http.server 8080
```

Ardindan `http://localhost:8080` adresini ac.

## iPhone'a kurulum

1. Dosyalari HTTPS destekleyen statik bir hostinge yukle: GitHub Pages, Netlify veya benzeri.
2. iPhone'da linki Safari ile ac.
3. Paylas menusu > `Add to Home Screen` sec.
4. Ana ekrandaki ikonla uygulamayi ac.

Arkadasina kurdurmak icin ayni HTTPS linkini gondermesi yeterli. Apple Developer hesabi gerekmez.

## Notlar

- Ilk acilista JSZip, html2canvas ve jsPDF CDN'den yuklenir.
- Fatura dosyalari sunucuya yuklenmez; zip ve PDF islemi tarayicida yapilir.
- Ornek dosyalar `example_data` klasorundedir.
- iPhone'da WhatsApp'tan kopyalanan zip'in dogrudan yapistirilmesi iOS clipboard davranisina baglidir. Calismazsa WhatsApp'ta `Save to Files`, sonra uygulamada `Zip dosyasi sec` akisini kullan.
