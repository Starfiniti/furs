# Produkcijski vstopni podatki in odgovornosti

Ta obrazec je obvezen pred izdelavo končne produkcijske konfiguracije. Ne vsebuje
gesel, zasebnih ključev, certifikatov ali bearer tokenov; vanj se vpišejo samo
njihove lokacije oziroma odgovorni upravljavci.

## 1. Zavezanec in poslovni obseg

| Podatek | Odločitev |
|---|---|
| Firma, sedež in država izdajatelja računov | VNESTI |
| Davčni status in ID za DDV | POTRDI RAČUNOVODSTVO |
| Aktivne države ter B2B/B2C tokovi | VNESTI |
| Aktivne vrstice podpisane matrike scenarijev | VNESTI ID-JE |
| Datum začetka produkcijske uporabe | VNESTI |
| Zakoniti zastopnik | VNESTI |
| Produkcijski compliance owner | VNESTI |

## 2. Izdajni sistem in integracija

| Podatek | Odločitev |
|---|---|
| Primarna platforma/ERP | Shopify / WooCommerce / Medusa / Next.js / drugo: VNESTI |
| Točna različica in okolje platforme | VNESTI |
| Dogodek, ki sproži izdajo/popravek | VNESTI |
| Vir postavk, DDV, kupca in plačilne politike | VNESTI |
| Integracijski owner | VNESTI |
| Testni/sandbox račun platforme | VNESTI REFERENCO, NE GESLA |
| Ciljni webhook HTTPS URL | VNESTI |
| SSO/MFA način za operaterje | VNESTI |

## 3. FURS identitete

| Podatek | Odločitev |
|---|---|
| Oznake produkcijskih poslovnih prostorov | VNESTI |
| Vrsta in uradni podatki vsakega prostora | VNESTI V ZAŠČITENI PRILOGI |
| Oznake elektronskih naprav | VNESTI |
| Izbrani model številčenja B/C | POTRDI V INTERNEM AKTU |
| Operaterji: lokalni/tuji/self-service | VNESTI MODEL; OSEBNE PODATKE HRANI ZAŠČITENO |
| Produkcijski PKCS#12 pridobljen prek eDavkov | DA/NE; NE PRILAGAJ DATOTEKE |
| Zaščitena lokacija certifikata/passphrase | VNESTI REFERENCO |
| Nadomestno potrdilo za rotacijo | DA/NE; VNESTI REFERENCO |

Testno potrdilo, testni prostori in testne naprave se ne prenesejo v produkcijo.

## 4. Infrastruktura

| Podatek | Odločitev |
|---|---|
| Gostovanje/ponudnik | VNESTI |
| Regija in država obdelave | VNESTI |
| Omrežna meja/reverse proxy/WAF | VNESTI |
| Produkcijska domena in TLS owner | VNESTI |
| PostgreSQL ponudnik/različica | VNESTI |
| Šifriranje diska, baze in varnostnih kopij | VNESTI |
| Upravljalnik skrivnosti/KMS/HSM | VNESTI |
| NTP/NTS viri in omrežni allowlist | VNESTI |
| Način namestitve in rollback | VNESTI |
| Ločena staging namestitev | VNESTI |

## 5. Kapaciteta in razpoložljivost

| Podatek | Odločitev |
|---|---|
| Pričakovano povprečno št. računov/uro | VNESTI |
| Pričakovani peak računov v najkrajšem relevantnem oknu | VNESTI ŠTEVILO IN OKNO |
| Odobren test-load total (najmanj 3× peak) | VNESTI |
| Odobren test-load concurrency in termin | VNESTI |
| RPO | VNESTI |
| RTO | VNESTI |
| Časovno okno vzdrževanja | VNESTI |
| Postopek FURS prekinitve povezave | IME/RAZLIČICA RUNBOOKA |
| Postopek okvare naprave in lokacija VKR | VNESTI IN POTRDI |

## 6. Varnostne kopije in hramba

| Podatek | Odločitev |
|---|---|
| Pogostost baznih backupov in WAL/PITR okno | VNESTI |
| Ločena/nespremenljiva lokacija kopij | VNESTI |
| Ključ/owner šifriranja backupov | VNESTI REFERENCO |
| Retencija vsake vrste zapisa | PRILOŽI PODPISAN RAZPORED |
| Retencija dnevnikov | VNESTI |
| Brisanje iztečenih backupov | VNESTI |
| Datum zadnjega izoliranega restore/PITR testa | VNESTI |
| Backup in restore owner | VNESTI |

## 7. Nadzor, alarmi in incidenti

| Podatek | Odločitev |
|---|---|
| Prometheus/monitoring namestitev | VNESTI |
| Alertmanager oziroma ponudnik obvestil | VNESTI |
| Primarni in rezervni dežurni prejemnik | VNESTI |
| Kanal za critical opozorila | VNESTI |
| Čas potrditve in eskalacija | VNESTI |
| Varnostni/incidentni kontakt | VNESTI |
| Kontakt računovodje/compliance ownerja | VNESTI |
| Dokaz zadnjega end-to-end alert drill-a | VNESTI |

## 8. Zasebnost in pogodbe

| Podatek | Odločitev |
|---|---|
| Upravljavec osebnih podatkov | VNESTI |
| Obdelovalci/podobdelovalci | VNESTI |
| Nameni in pravne podlage | POTRDI PRAVNIK/DPO |
| Prenosi izven EGP | VNESTI/POTRDI |
| DPA in pogodbe s ponudniki | VNESTI REFERENCE |
| Postopek pravic posameznika | VNESTI |
| Kontakt ob kršitvi podatkov | VNESTI |
| Perioda pregleda dostopov | VNESTI |

## 9. Dokončna vrata

- [ ] Računovodska matrika in interni akt sta podpisana.
- [ ] Produkcijski prostor, naprave in operaterji so potrjeni.
- [ ] Produkcijski certifikat je zaščiten, preverjen in ima rotacijski načrt.
- [ ] 48-urni soak, 3× load, backup/PITR in alarmni drill imajo pregledane dokaze.
- [ ] Neodvisni varnostni pregled nima odprtih kritičnih/visokih ugotovitev.
- [ ] Hramba/privacy in pogodbe so odobrene.
- [ ] Imenovani compliance owner podpiše release manifest za točen commit.
- [ ] Nepodprti scenariji so tehnično blokirani.

Kraj in datum: ____________________

Odgovorna oseba: ____________________

Odobritev/referenca: ____________________
