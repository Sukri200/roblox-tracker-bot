# Roblox Tracker Bot

Discord bot untuk memantau status akun Roblox dan mengirim notifikasi perubahan status ke channel Discord.

## Deploy di Railway

1. Buat project di Railway dan deploy repository ini dari GitHub.
2. Tambahkan Variables:
   - `DISCORD_TOKEN`: token bot Discord yang baru dibuat/reset dari Discord Developer Portal.
   - `CLIENT_ID`: Application ID dari Discord Developer Portal.
   - `GUILD_ID` (opsional): ID server Discord untuk mendaftarkan slash commands lebih cepat saat pengujian.
3. Railway menjalankan `npm start`.

## Commands

- `/track userid:<ID Roblox>` — mulai memantau akun.
- `/tracking` — lihat akun yang dipantau.
- `/removeplayer userid:<ID Roblox>` — hapus akun dari daftar.
- `/setchannel channel:<channel>` — pilih channel notifikasi.

## Catatan

Daftar akun dan channel saat ini disimpan di memori proses, jadi akan kosong setelah restart. Jangan simpan token Discord di source code atau unggah ke GitHub.
