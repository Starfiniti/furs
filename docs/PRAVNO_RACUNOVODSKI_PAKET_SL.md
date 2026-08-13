# Pravno-računovodski paket za pregled

Datum priprave: 13. avgust 2026

Različica: 1.0 – osnutek za strokovni pregled

Zahteve: `FURS-PAY-001`, `FURS-OP-001/002`, `FURS-PREM-001`,
`FURS-COR-001`, `FURS-OUT-001/002`, `FURS-DEV-001`, `FURS-AUD-001`

## Namen in meja dokumenta

Ta paket je pripravila družba **Starfiniti d.o.o., Pod gabri 33, 3000 Celje**,
ki razvija Starfiniti FURS Kit. Produkt je odprtokodni pogon za tehnično davčno
potrjevanje računov in ni celovit računovodski, davčni ali ERP sistem. Starfiniti
FURS Kit ni certificiran, potrjen ali odobren s strani FURS.

Dokumenti so delovna podlaga za slovenskega računovodjo, davčnega svetovalca in
po potrebi pravnika. Ne predstavljajo pravnega ali davčnega mnenja. Produkcijska
uporaba ostane blokirana, dokler niso potrjeni dejanski poslovni scenariji,
odgovornosti, hramba in interni akt posameznega zavezanca.

## Podatki nosilca projekta

| Podatek | Vrednost |
|---|---|
| Razvijalec/dobavitelj programske opreme | Starfiniti d.o.o. |
| Naslov | Pod gabri 33, 3000 Celje |
| Odgovorna oseba projekta | Dejan Kletečki |
| Davčna in matična številka | Ne objavita se v javnem repozitoriju; pregledovalec ju preveri iz uradne evidence oziroma pogodbe |
| Davčni status in dejanska dejavnost | **POTRDI RAČUNOVODSTVO** |
| Zavezanec, ki bo izdajal račune | **VNESTI ZA VSAKO PRODUKCIJSKO NAMESTITEV** |

Razvijalec programske opreme in zavezanec, ki izdaja račune, nista nujno ista
pravna oseba. Interni akt, poslovni prostori, operaterji, davčne odločitve in
vsebina računov se vedno potrdijo za konkretnega zavezanca.

## Dokumenti za pregled

1. [Matrika poslovnih scenarijev](../templates/matrika-poslovnih-scenarijev-sl.md)
   določa, kdaj se račun izda in ali se davčno potrdi.
2. [Osnutek internega akta](../templates/interni-akt-davcno-potrjevanje-sl.md)
   določa poslovne prostore, naprave, številčenje in odgovornosti.
3. [Kontrolni seznam sestavin računa](../templates/kontrolni-seznam-racun-sl.md)
   razmejuje podatke, ki jih zagotovi ERP/prodajna platforma, in podatke, ki jih
   ustvari FURS pogon.
4. [Obvestilo kupcem](../templates/obvestilo-kupcem-racun-sl.md) opisuje obvezno
   uradno obvestilo in način objave, ne pa lastne grafične zamenjave uradne priloge.
5. [Potrditev strokovnega pregleda](../templates/potrditev-pravno-racunovodskega-pregleda-sl.md)
   zabeleži odobrene, blokirane in ročne scenarije ter odgovorne osebe.

## Vprašanja, na katera mora pregled odgovoriti

- Kdo je v posameznem toku dejanski prodajalec oziroma izvajalec in kdo izda račun?
- Katere države, B2B/B2C tokovi, davčne stopnje, oprostitve in obrnjene davčne
  obveznosti so dejansko v obsegu?
- Kateri načini plačila so aktivni in ali gre za neposredno nakazilo na
  transakcijski račun ali za »gotovino« po ZDavPR?
- Kdaj nastanejo dobava, prejem plačila, obveznost izdaje računa in obveznost
  davčnega potrjevanja pri predplačilih, naročninah, dostavi in vračilih?
- Kdo določi davčno osnovo, stopnjo DDV, oprostitev, zaokroževanje in vsebino
  postavk? Starfiniti FURS Kit teh odločitev ne sme ugibati.
- Kateri poslovni prostori, elektronske naprave in modeli operaterjev se uporabljajo?
- Kako se obravnavajo celotna in delna vračila, storno, dobropis in odpoved pred
  oziroma po potrditvi?
- Kateri postopek velja ob prekinitvi povezave s FURS in kateri ob okvari same
  naprave/programske opreme, ko je potreben odobren VKR postopek?
- Kdo je upravljavec osebnih podatkov, kdo so obdelovalci in koliko časa se hrani
  vsaka vrsta zapisa ter varnostnih kopij?

## Trenutno pravno opozorilo glede spletnih plačil

Uradna stran SPOT za spletno trgovino se je od zadnje potrjene vsebinske osnove
spremenila. Trenutna stran navaja primere načinov plačila, vendar spremembe brez
primerjave prejšnje vsebine ni mogoče samodejno pretvoriti v produkcijsko davčno
politiko. Zato so Stripe, PayPal, spletne kartice, plačilo po povzetju, darilne
kartice in mešana plačila v matriki označeni za izrecno potrditev računovodje.

Do podpisa velja varno pravilo: neodobren scenarij se blokira ali usmeri v ročno
obravnavo; programska oprema ga ne klasificira na podlagi imena ponudnika plačila.

## Uradni viri, pregledani 13. avgusta 2026

- [FURS – tehnična dokumentacija davčnega potrjevanja računov](https://edavki.durs.si/edavkiportal/openportal/CommonPages/Opdynp/PageD.aspx?category=dpr_teh_spec)
  (tehnična dokumentacija 3.2 in uradni shemi).
- [PISRS – Zakon o davčnem potrjevanju računov (ZDavPR)](https://pisrs.si/pregledPredpisa?id=ZAKO7195).
- [PISRS – Pravilnik o izvajanju ZDavPR](https://pisrs.si/pregledPredpisa?id=PRAV12531).
- [SPOT – vodenje poslovnih knjig in davčno potrjevanje](https://spot.gov.si/sl/teme/vodenje-poslovnih-knjig/).
- [SPOT – izdajanje računov](https://spot.gov.si/sl/teme/izdajanje-racunov/).
- [SPOT – vodič za spletne trgovine](https://spot.gov.si/sl/dejavnosti-in-poklici/vodic-za-spletne-trgovine).
- [FURS – davčne blagajne, VKR in uradna obvestila](https://www.fu.gov.si/nadzor/podrocja/davcne_blagajne_in_vezane_knjige_racunov_vkr).

Repozitorij spremlja prstne odtise normativnih virov. Spremenjen vir pred izdajo
zahteva datiran človeški pregled in odločitev o vplivu.

## Predlagani postopek potrditve

1. Dejan Kletečki označi dejansko aktivne vrstice v matriki.
2. Računovodja/davčni svetovalec dopolni odločitev, rok, pravno podlago in opombe.
3. Pravnik oziroma pooblaščena oseba potrdi zasebnost, hrambo, pogodbe in obvestila.
4. Zavezanec sprejme in podpiše svoj interni akt pred začetkom izdajanja računov.
5. Imenovani produkcijski compliance owner odobri samo podpisane scenarije.
6. Potrjena matrika dobi različico in se v sistem vnese kot eksplicitna politika;
   nepodprti scenariji ostanejo blokirani.
