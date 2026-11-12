# Innocentrex Threads Poster

Sistem kecil untuk menjadualkan dan menerbitkan post ke Threads (@innocentrextech) tanpa servis berbayar.

## Cara ia berfungsi

1. Post disimpan sebagai giliran dalam `queue/posts.json`. Ia ditulis oleh papan pemuka (`dashboard/index.html`) atau oleh tugasan harian Claude.
2. GitHub Actions (`.github/workflows/publish.yml`) berjalan setiap 30 minit, menerbitkan post yang sudah sampai waktunya melalui Threads API rasmi, dan mengemas kini status dalam giliran.
3. Token Threads disimpan sebagai secret repo. Ia tidak pernah berada dalam kod atau dalam papan pemuka.

## Persediaan (sekali sahaja)

### 1. Cipta app Meta dan dapatkan token Threads

1. Pergi ke https://developers.facebook.com, daftar sebagai developer, dan cipta app baharu dengan use case "Access the Threads API".
2. Dalam app itu, tambah izin `threads_basic` dan `threads_content_publish`.
3. Di App roles > Roles > Add People, tambah akaun @innocentrextech sebagai "Threads Tester".
4. Dalam app Threads, log masuk sebagai @innocentrextech dan terima jemputan itu di Settings > Account > Website permissions.
5. Jana access token untuk akaun itu (User Token Generator dalam tetapan use case Threads), kemudian tukar kepada token long-lived (sah 60 hari):

   ```
   https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=THREADS_APP_SECRET&access_token=TOKEN_PENDEK
   ```

6. Dapatkan ID pengguna Threads:

   ```
   https://graph.threads.net/v1.0/me?fields=id,username&access_token=TOKEN_PANJANG
   ```

Antara muka Meta kerap berubah. Jika langkah di atas tidak sepadan, rujuk https://developers.facebook.com/docs/threads/get-started.

### 2. Simpan secret dalam repo ini

Di Settings > Secrets and variables > Actions, tambah:

| Secret | Nilai |
|---|---|
| `THREADS_ACCESS_TOKEN` | Token long-lived dari langkah 1.5 |
| `THREADS_USER_ID` | ID dari langkah 1.6 |
| `ADMIN_TOKEN` (pilihan) | Fine-grained PAT untuk repo ini dengan izin Secrets: Read and write. Membolehkan token Threads diperbaharui secara automatik setiap minggu. |

Tanpa `ADMIN_TOKEN`, token Threads perlu dijana semula secara manual sebelum 60 hari.

### 3. Buka papan pemuka

1. Muat turun `dashboard/index.html` dan buka dalam pelayar (atau hoskan dengan GitHub Pages).
2. Tekan Tetapan, masukkan pemilik repo, nama repo, dan satu fine-grained GitHub token yang dihadkan kepada repo ini dengan izin Contents dan Actions: Read and write.

Token GitHub itu disimpan dalam pelayar anda sahaja. Tanpa token, papan pemuka berjalan dalam mod demo dengan data contoh.

## Ujian

```
DRY_RUN=1 node scripts/publish.mjs
```

Mod ini menunjukkan post yang akan diterbitkan tanpa memanggil Threads.

## Format giliran

```json
{
  "id": "2026-11-13-abc123",
  "text": "Teks post, maksimum 500 aksara",
  "publish_at": "2026-11-13T08:30:00+08:00",
  "status": "scheduled",
  "created_by": "dashboard"
}
```

Status: `scheduled`, `published`, `failed`. Post yang lewat lebih 6 jam tidak diterbitkan dan ditanda `failed`.

## Had yang perlu diketahui

- Jadual GitHub Actions boleh lewat beberapa minit daripada masa yang ditetapkan.
- Workflow berjalan 48 kali sehari. Dalam repo peribadi ini menggunakan minit percuma GitHub Actions; semak penggunaan di Settings > Billing.
- Threads mengehadkan 250 post dalam 24 jam bagi setiap profil.
