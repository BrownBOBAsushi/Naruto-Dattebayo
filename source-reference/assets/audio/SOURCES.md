# Jutsu audio catalog

This is the sourced catalog for this iteration, not an exhaustive list of every Naruto jutsu. Character attribution is based on the source pages below, not independent speaker identification. No voices are synthesized or impersonated.

| Jutsu | Callout used | File | Source |
| --- | --- | --- | --- |
| Chidori | Sasuke (2.325 s); exact Kakashi clip not verified | sasuke-chidori.mp3 | https://tuna.voicemod.net/sound/7cebfd55-a309-4ab8-9a5e-e1fdbaf105c4 — uploader zeromesh explicitly identifies Sasuke |
| Doton: Doryūheki | Kakashi / Kazuhiko Inoue (2.482 s), Road to Ninja 06:49 | kakashi-doryuheki.wav | https://www.animecharactersdatabase.com/quotesbycharacter.php?line_id=238033 — exact quoted phrase “Doton: Doryūheki!” |
| Katon: Gōkakyū no Jutsu | Sasuke (6.896 s) | sasuke-fireball.mp3 | https://tuna.voicemod.net/sound/2f337eb2-d088-4cd4-8039-3a96d8e230f3 — uploader zeromesh identifies Japanese Sasuke Fireball |
| Suiton: Suiryūdan no Jutsu | Kisame recording not verified; no substitute plays | none | Searched soundboards and quote catalogs; unattributed clips were not assigned to Kisame |
| Kage Bunshin no Jutsu | Naruto (1.489 s) | naruto-shadow-clone.mp3 | https://github.com/bunkerapps/Jutsu-Hero/blob/main/CREDITS.md |

Downloaded source media:
- https://us-tuna-sounds-files.voicemod.net/7cebfd55-a309-4ab8-9a5e-e1fdbaf105c4.mp3
- https://ami.animecharactersdatabase.com/audio/104001/1/104001-1-73.mp4 (audio transcoded to WAV for browser decoding)
- https://us-tuna-sounds-files.voicemod.net/2f337eb2-d088-4cd4-8039-3a96d8e230f3.mp3
- https://raw.githubusercontent.com/bunkerapps/Jutsu-Hero/main/public/assets/audio/voice/Kage%20Bushin%20No%20Jutsu.mp3

Naruto media belongs to its respective owners, including Masashi Kishimoto / Shueisha and Studio Pierrot. Availability on these source sites does not establish an independent redistribution license.

## Homepage music

The user supplied `Naruto - Afternoon of Konoha.mp3`, copied unchanged to `homepage.mp3`. It plays through a native audio element configured in `data/audio.json`, with no video player. Playback loops at 35% volume on the homepage, pauses in Practice Mode or when the tab is hidden, and resumes on return. Browser autoplay restrictions may require a first interaction. Original user reference: https://www.youtube.com/watch?v=qAGvQDoL5s4 .

## Training hand signs

All entries are capped at three supported classifier signs. These are gameplay adaptations; they are not presented as full canonical sequences.

- Chidori: Ox → Hare → Monkey. Reference: https://naruto.fandom.com/wiki/Chidori
- Fireball: Serpent → Ram → Tiger, shortened from the longer sequence. Reference: https://naruto.fandom.com/wiki/Fire_Release:_Great_Fireball_Technique
- Earth Wall: Tiger → Hare → Dog, shortened from Tiger → Hare → Boar → Dog. Reference: https://naruto.fandom.com/wiki/Earth_Release:_Earth-Style_Wall
- Water Dragon: Ox → Monkey → Bird, shortened from the long sequence. Reference: https://naruto.fandom.com/wiki/Water_Release:_Water_Dragon_Bullet_Technique
- Shadow Clone: Ram → Serpent → Tiger is an invented training combination. Its canonical cross-shaped clone seal is not supported by the current 12-sign classifier. Reference: https://naruto.fandom.com/wiki/Shadow_Clone_Technique

## Game cues

The weave (short filtered noise swish) and completion “deng” (three-tone bell) are original procedural Web Audio effects. Every accepted sign, including the third, sounds one weave. Completion schedules the bell 140 ms later and the callout no earlier than 650 ms after the third sign. Practice waits for the callout to end before resetting. Mode/jutsu/character changes and mute cancel pending playback.
