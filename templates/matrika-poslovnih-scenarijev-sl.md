# Matrika poslovnih scenarijev – osnutek za računovodski pregled

Zavezanec: **VNESTI**

Različica politike: **VNESTI**

Datum pregleda: **VNESTI**

Pregledovalec: **VNESTI**

Zahteva: `FURS-PAY-001`

## Navodilo

Za vsako dejansko aktivno vrstico izpolnite vsa polja. Odločitev »DA/NE« brez
pravne podlage, trenutka izdaje in predpostavk ni dovolj. Če se isti način plačila
različno obravnava glede na pogodbeni tok, državo, merchant-of-record ali trenutek
dobave, vrstico razdelite na več različic.

Status podpore je lahko samo:

- **PODPRTO** – odločitev je podpisana in tehnični tok je testiran;
- **BLOKIRANO** – API mora scenarij zavrniti pred izdajo računa;
- **ROČNO** – potreben je dokumentiran pregled operaterja;
- **NI V OBSEGU** – scenarij se pri zavezancu ne uporablja.

## Matrika

| ID | Scenarij | Aktiven? | Prodajalec / država | B2B/B2C in kanal | Plačilni tok | Trenutek dobave in izdaje računa | Potrditi? | Rok oddaje | Prostor / naprava / operater | Popravek ali vračilo | Pravna podlaga in predpostavke | Status podpore | Inicialke / datum |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S01 | Neposredno bančno nakazilo / UPN na TRR prodajalca | POTRDI | VNESTI | VNESTI | VNESTI natančen račun in prejemnika | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI RAČUNOVODSTVO; ne enačiti vseh ponudnikov z neposrednim TRR | BLOKIRANO | VNESTI |
| S02 | Gotovina – bankovci/kovanci | POTRDI | VNESTI | VNESTI | Kupec plača neposredno z gotovino | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | ZDavPR in aktualna SPOT navodila; potrdi izjeme | BLOKIRANO | VNESTI |
| S03 | Plačilna kartica na POS | POTRDI | VNESTI | VNESTI | VNESTI ponudnika in poravnavo | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI RAČUNOVODSTVO | BLOKIRANO | VNESTI |
| S04 | Kartica v spletni blagajni | POTRDI | VNESTI | VNESTI | VNESTI acquiring/PSP/MoR tok | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | Spremenjena SPOT vsebina; obvezen podpis | BLOKIRANO | VNESTI |
| S05 | Stripe | POTRDI | VNESTI | VNESTI | Navedi Stripe produkt, pogodbeno stranko, settlement račun in MoR status | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | Ime ponudnika samo po sebi ni davčna odločitev | BLOKIRANO | VNESTI |
| S06 | PayPal | POTRDI | VNESTI | VNESTI | Navedi PayPal produkt, prejemni račun in izplačilo | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | Ime ponudnika samo po sebi ni davčna odločitev | BLOKIRANO | VNESTI |
| S07 | Plačilo po povzetju | POTRDI | VNESTI | VNESTI | VNESTI: gotovina/kartica, kurir, kdo prejme sredstva | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | Potrdi najpoznejši trenutek glede na dobavo | BLOKIRANO | VNESTI |
| S08 | Darilna kartica / dobroimetje trgovine | POTRDI | VNESTI | VNESTI | Enonamenski/večnamenski bon, nakup in unovčenje | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | Potrdi DDV in fiskalni dogodek ob izdaji ter unovčenju | BLOKIRANO | VNESTI |
| S09 | Predplačilo / delno plačilo | POTRDI | VNESTI | VNESTI | Zneski in način vsakega plačila | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | Potrdi predplačilni in končni račun ter povezave | BLOKIRANO | VNESTI |
| S10 | Naročnina / ponavljajoče plačilo | POTRDI | VNESTI | VNESTI | Ponudnik, interval, neuspešna/ponovljena bremenitev | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | Vsak obračunski dogodek opiši ločeno | BLOKIRANO | VNESTI |
| S11 | Celotno vračilo po potrditvi | POTRDI | VNESTI | VNESTI | VNESTI izvirni in povratni tok | POTRDI | POTRDI | POTRDI | POTRDI | Nov povezan popravek; izvirnik ostane nespremenjen | ZDavPR/ZDDV-1; potrdi predznake in DDV | BLOKIRANO | VNESTI |
| S12 | Delno vračilo po potrditvi | POTRDI | VNESTI | VNESTI | VNESTI izvirni in povratni tok | POTRDI | POTRDI | POTRDI | POTRDI | Nov povezan popravek z natančnimi postavkami | POTRDI RAČUNOVODSTVO | BLOKIRANO | VNESTI |
| S13 | Odpoved pred fiskalizacijo | POTRDI | VNESTI | VNESTI | VNESTI | POTRDI | POTRDI | POTRDI | POTRDI | Določi, ali račun sploh nastane in kako se porabi rezervirana številka | POTRDI RAČUNOVODSTVO | BLOKIRANO | VNESTI |
| S14 | Odpoved/storno po potrditvi | POTRDI | VNESTI | VNESTI | VNESTI | POTRDI | POTRDI | POTRDI | POTRDI | Vedno nov povezan dokument; potrjenega zapisa se ne prepisuje | `FURS-COR-001`; potrdi davčno vsebino | BLOKIRANO | VNESTI |
| S15 | Samopostrežni tok brez fizičnega operaterja | POTRDI | VNESTI | VNESTI | VNESTI | POTRDI | POTRDI | POTRDI | POTRDI eksplicitni self-service model | POTRDI | Ne uporabljaj samodejno davčne št. podjetja kot operaterja | BLOKIRANO | VNESTI |
| S16 | Tuji fizični operater | POTRDI | VNESTI | VNESTI | VNESTI | POTRDI | POTRDI | POTRDI | Tuji operater brez slovenske davčne št. po protokolu | POTRDI | `FURS-OP-002`; potrdi delovnopravni/identitetni tok | BLOKIRANO | VNESTI |
| S17 | Marketplace / merchant-of-record | POTRDI | VNESTI | VNESTI | Kdo je prodajalec, kdo prejme kupnino, kdo izda račun | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | Pogodba in MoR status sta obvezna priloga | BLOKIRANO | VNESTI |
| S18 | B2B oprostitev / obrnjena davčna obveznost | POTRDI | VNESTI | B2B; država in DDV ID | VNESTI | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | Navedi člen/klavzulo, dokazila in odgovornost za validacijo DDV ID | BLOKIRANO | VNESTI |
| S19 | Mešano plačilo | POTRDI | VNESTI | VNESTI | Razdeli gotovinski/negotovinski del, vrstni red in vračilo | POTRDI | POTRDI | POTRDI | POTRDI | POTRDI | Potrdi obravnavo celotnega računa in vsakega dela | BLOKIRANO | VNESTI |

## Dodatne obvezne odločitve

| Odločitev | Potrditev pregledovalca |
|---|---|
| Dejanske stopnje DDV, oprostitve in posebne ureditve | VNESTI |
| Pravilo za zaokroževanje ter vir resnice za davčne osnove in DDV | VNESTI |
| Ali se uporabljajo polni ali poenostavljeni računi in pod katerimi pogoji | VNESTI |
| Države prodaje in pravila za čezmejne tokove/OSS | VNESTI |
| Način preverjanja DDV ID kupca | VNESTI |
| Odgovornost za trenutek dobave, prejetega plačila in izdaje | VNESTI |
| Rok in postopek naknadne oddaje ob prekinitvi povezave | VNESTI |
| VKR postopek ob okvari naprave/programske opreme | VNESTI |
