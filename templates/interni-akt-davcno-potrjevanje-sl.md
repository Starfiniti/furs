# Interni akt o popisu poslovnih prostorov in pravilih številčenja računov

**OSNUTEK – zavezanec ga mora prilagoditi, strokovno pregledati in sprejeti pred
začetkom davčnega potrjevanja računov.** Interni akt se praviloma ne pošilja FURS,
vendar se hrani in predloži na zahtevo v postopku nadzora.

## 1. Podatki zavezanca

- Firma: **VNESTI**
- Sedež: **VNESTI**
- Davčna številka / ID za DDV: **VNESTI V ZAŠČITENO KONČNO KOPIJO**
- Matična številka: **VNESTI V ZAŠČITENO KONČNO KOPIJO**
- Zakoniti zastopnik: **VNESTI**
- Datum začetka uporabe akta: **VNESTI**
- Različica akta: **VNESTI**

Če je zavezanec Starfiniti d.o.o., se kot firma in sedež vpišeta
**Starfiniti d.o.o., Pod gabri 33, 3000 Celje**. Starfiniti d.o.o. je razvijalec
programske opreme; za namestitve pri drugih strankah mora interni akt vedno
sprejeti dejanski izdajatelj računov.

## 2. Pravna in dokumentacijska podlaga

Akt je pripravljen ob upoštevanju ZDavPR, pravilnika o izvajanju ZDavPR,
aktualnih uradnih navodil FURS/SPOT in potrjene matrike poslovnih scenarijev
zavezanca. V primeru spremembe zakona, pravilnika, uradnih navodil, poslovnega
modela, prostorov, naprav ali številčenja odgovorna oseba preveri potrebo po novi
različici akta in prijavi spremembe FURS.

## 3. Način izdajanja računov

Zavezanec uporablja naslednje načine:

- [ ] elektronska naprava/programska oprema za izdajo računov;
- [ ] vezana knjiga računov v poslovnih prostorih, kjer je to izrecno določeno;
- [ ] odobren postopek VKR ob okvari elektronske naprave/programske opreme.

Za isti poslovni prostor se izbira elektronske naprave in VKR uskladi z veljavnimi
zakonskimi pogoji. Prekinitev povezave s FURS ni isto kot okvara elektronske
naprave. Pri delujoči napravi in prekinjeni povezavi se ohranijo prvotna identiteta
računa, čas izdaje, podatki in ZOI ter se uporabi naknadna oddaja. Pri okvari
naprave se aktivira odobren VKR postopek.

## 4. Popis poslovnih prostorov

| Oznaka prostora | Vrsta (nepremični/premični) | Naslov ali opis | Katastrski podatki, če so zahtevani | Datum veljavnosti | Status/prijava FURS |
|---|---|---|---|---|---|
| VNESTI | VNESTI | VNESTI | VNESTI | VNESTI | VNESTI |

Za vsak prostor se pred prvo uporabo evidentira dokaz uspešne prijave. Sprememba
ali zaprtje prostora se sporoči pred uporabo spremenjenega stanja in shrani v
revizijsko evidenco.

## 5. Elektronske naprave in programska oprema

| Oznaka naprave | Poslovni prostor | Namen/kanal | Programska oprema in različica | Datum aktivacije | Status |
|---|---|---|---|---|---|
| VNESTI | VNESTI | VNESTI | Starfiniti FURS Kit + VNESTI izdajni sistem | VNESTI | VNESTI |

Starfiniti FURS Kit izvaja tehnično podpisovanje, komunikacijo, preverjanje
odgovora, identiteto fiskalnega dokumenta in revizijske sledi. Prodajna/ERP
platforma zagotovi pravno in računovodsko pravilne postavke, davke, kupca,
plačilni scenarij in trenutek izdaje.

## 6. Pravila dodeljevanja zaporednih številk

Izbrani način po pravilniku: **POTRDI IN OZNAČI MODEL B ALI C**.

- Oznaka računa je sestavljena iz oznake poslovnega prostora, oznake elektronske
  naprave in zaporedne številke.
- Zaporedna številka je pozitivno celo število in se povečuje v skladu z izbranim
  modelom.
- Že dodeljena številka se nikoli ne uporabi ponovno, tudi po napaki, prekinitvi
  transakcije ali ponovljenem klicu.
- Ponovljen poslovni dogodek z isto idempotency oznako ne ustvari novega računa.
- Potrjen račun je nespremenljiv; popravek ali storno je nov, povezan dokument.

Natančen opis serij in prehodov ob menjavi leta/naprave/prostora: **VNESTI IN
POTRDI RAČUNOVODSTVO**.

## 7. Osebe, ki izdajajo račune

| Interna oznaka | Vloga | Slovenska fizična oseba / tuji operater / samopostrežno | Zahtevani identitetni podatek | Veljavnost |
|---|---|---|---|---|
| VNESTI | VNESTI | VNESTI | VNESTI V ZAŠČITENI EVIDENCI | VNESTI |

Davčna številka podjetja se ne uporabi samodejno kot davčna številka fizičnega
operaterja. Tuji operater in samopostrežni tok se modelirata izrecno po potrjeni
politiki.

## 8. Popravki, vračila, storni in kopije

- Potrjenega računa ni dovoljeno prepisati ali izbrisati.
- Celotno ali delno vračilo oziroma storno po potrditvi se izvede z novim
  dokumentom, ki se nedvoumno nanaša na izvirnik.
- Davčna vsebina, predznaki in trenutek izdaje popravka sledijo podpisani matriki.
- Kopija računa mora biti označena kot kopija in sledljiva; sistem zagotovi izpis
  podatkov o izdanih kopijah in času izdaje, kjer to zahteva ZDavPR.
- Odpoved pred potrditvijo ne sme povzročiti ponovne uporabe že rezervirane
  zaporedne številke.

## 9. Izredni dogodki

### Prekinitev povezave s FURS

Odgovorna oseba preveri, da elektronska naprava deluje, spremlja račune brez EOR,
rok naknadne oddaje in starost najstarejšega nepotrjenega računa. Po obnovi
povezave se pošlje izvirni nespremenjeni zapis z oznako naknadne oddaje. Neznan
izid ali prekoračen rok se usmeri v ročno obravnavo.

### Okvara elektronske naprave/programske opreme

Navadno elektronsko izdajanje se ustavi in uporabi pregledan VKR postopek.
Lokacija potrjene VKR, odgovorna oseba, način kasnejšega vnosa in uskladitve:
**VNESTI PRED PRODUKCIJO**.

### Potrdilo, ura ali varnostni incident

Izdajanje se ustavi, če je potrdilo neveljavno/preklicano, zaupanja vredna ura ni
potrjena ali podpisanega odgovora ni mogoče kriptografsko preveriti. Incident se
evidentira in rešuje po odobrenem postopku brez izklopa TLS ali podpisnih kontrol.

## 10. Hramba, dostopi in varstvo podatkov

Zavezanec določi in podpiše razpored hrambe za račune, fiskalne dokaze, revizijske
dogodke, kopije, varnostne kopije, dnevnike in metapodatke potrdil. Kopije računov
se po aktualnem SPOT povzetku praviloma hranijo 10 let, računi v zvezi z
nepremičninami 20 let po poteku zadevnega leta; konkretno uporabo, začetek teka
roka, izjeme in brisanje varnostnih kopij mora potrditi pravni/računovodski
pregledovalec.

Zasebni ključi, PKCS#12 datoteke in gesla niso del javnega akta ter se hranijo v
zaščitenem upravljalniku skrivnosti. Dostopi do produkcijskih podatkov, varnostnih
kopij in izvozov so omejeni, revizijsko sledljivi in periodično pregledani.

## 11. Odgovornosti

| Vloga | Ime/organizacija | Odgovornost |
|---|---|---|
| Zakoniti zastopnik zavezanca | VNESTI | Sprejem akta in produkcijska odgovornost |
| Računovodja/davčni svetovalec | VNESTI | Davčna politika, scenariji, roki in vsebina računov |
| Compliance owner | VNESTI | Izdajna vrata, viri, dokazila in incidenti |
| Varnost/operacije | VNESTI | Potrdila, skrivnosti, varnostne kopije, nadzor in obnovitev |
| Razvijalec programske opreme | Starfiniti d.o.o. | Tehnična skladnost funkcij v pogodbeno določenem obsegu |

## 12. Sprejem in spremembe

Akt začne veljati z datumom podpisa. Vsaka sprememba dobi novo različico, datum,
razlog, podpis odgovorne osebe in dokaz o potrebni prijavi FURS.

Kraj in datum: ____________________

Zakoniti zastopnik: ____________________

Podpis/odobritev: ____________________
