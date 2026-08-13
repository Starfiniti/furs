# Kontrolni seznam obveznih sestavin računa

**Osnutek za pregled.** Zahteve se potrdijo za dejanski davčni status, vrsto
kupca, državo, dobavo in posebno ureditev. Starfiniti FURS Kit ni vir resnice za
računovodsko klasifikacijo.

## Razmejitev odgovornosti

| Skupina podatkov | Primarni vir/odgovornost | Naloga Starfiniti FURS Kit |
|---|---|---|
| Prodajalec, kupec, naslovi, ID za DDV | ERP/prodajna platforma + računovodstvo | Validira tehnično obliko le v podprtem pogodbenem obsegu |
| Blago/storitve, količina, cena, popust | ERP/prodajna platforma | Ohrani natančne decimalne vrednosti; ne izmišlja postavk |
| Davčna osnova, stopnja DDV, oprostitev, reverse charge | Računovodstvo/upstream davčna politika | Preslika že potrjeno odločitev v uradno shemo |
| Trenutek dobave, predplačila in izdaje | Upstream poslovni sistem po podpisani matriki | Iz enega nespremenljivega lokalnega časa izdela FURS formate |
| Plačilni scenarij in odločitev »potrditi/ne potrditi« | Podpisana politika zavezanca | Sprejme samo eksplicitno odobreno odločitev; ne sklepa iz ponudnika |
| Poslovni prostor, naprava, zaporedna številka | Interni akt + fiskalni register | Dodeli nespremenljivo identiteto brez ponovne uporabe številke |
| Operater | Zavezanec/HR/upstream identiteta | Preveri eksplicitni lokalni, tuji ali self-service model |
| ZOI, EOR, fiskalni čas in koda | Fiskalni pogon/FURS | Ustvari ZOI/kodo, preveri podpisan odziv in shrani EOR dokaz |
| Popravek/storno | Računovodstvo odloči vsebino; upstream zahteva dogodek | Ustvari nov povezan, nespremenljiv dokument |
| Končni prikaz/PDF/izročitev kupcu | Izdajni/ERP sistem | Vrne potrebne fiskalne podatke; sam ni renderer celotnega računa |

## Polni račun za DDV zavezanca – preveri uporabljivost

- [ ] datum izdaje;
- [ ] zaporedna številka, ki omogoča identifikacijo;
- [ ] ID za DDV prodajalca;
- [ ] ID za DDV kupca, kadar ga zahteva vrsta dobave;
- [ ] ime in naslov prodajalca ter kupca/naročnika;
- [ ] količina in vrsta blaga oziroma obseg in vrsta storitev;
- [ ] datum dobave/storitve ali predplačila, če je določljiv in drugačen od izdaje;
- [ ] davčna osnova po stopnjah/oprostitev, cena na enoto brez DDV ter popusti;
- [ ] stopnja DDV;
- [ ] znesek DDV v evrih in centih, razen zakonske posebnosti;
- [ ] zahtevane klavzule: samofakturiranje, oprostitev, obrnjena davčna obveznost
  ali posebna ureditev;
- [ ] posebni podatki za nepremičnine, predplačila, mešane dobave, nova prevozna
  sredstva ali druge dejanske posebnosti.

## Poenostavljeni račun – preveri pogoje

- [ ] datum izdaje;
- [ ] zaporedna identifikacijska številka;
- [ ] ime, naslov in ID za DDV prodajalca;
- [ ] količina/vrsta blaga ali obseg/vrsta storitve;
- [ ] znesek DDV ali informacije za njegov izračun, ločeno po stopnjah;
- [ ] pri popravku nedvoumna navedba izvirnega računa in konkretnih sprememb;
- [ ] ime/naslov kupca, kadar DDV zavezanec račun potrebuje za odbitek;
- [ ] pravna podlaga oprostitve oziroma zahtevana klavzula;
- [ ] potrjeno, da so izpolnjeni pogoji za poenostavljen račun (vključno z mejo
  vrednosti in čezmejnimi omejitvami).

## Če izdajatelj ni identificiran za DDV – preveri

- [ ] datum izdaje in zaporedna številka;
- [ ] firma/ime in sedež/prebivališče izdajatelja;
- [ ] prodajna cena in skupna vrednost brez DDV;
- [ ] količina/vrsta ali obseg/vrsta pri računu drugemu davčnemu zavezancu;
- [ ] računovodja je potrdil pravilno navedbo, da DDV ni obračunan.

## Dodatne sestavine davčno potrjenega računa

- [ ] čas izdaje računa – ura in minute;
- [ ] oznaka fizične osebe, ki izda račun, oziroma potrjen self-service/tuji model;
- [ ] EOR, kadar je ob izdaji pridobljen;
- [ ] ZOI;
- [ ] številka v treh delih: poslovni prostor / elektronska naprava / zaporedje;
- [ ] strojno berljiva koda iz predpisanih podatkov, kadar je zahtevana;
- [ ] postopek za račun, izdan med prekinitvijo povezave, pravilno prikazuje stanje
  brez EOR in kasnejši EOR brez spremembe prvotne identitete;
- [ ] kopija je označena »KOPIJA« z zaporedno številko kopije in sledljivim časom,
  kjer to zahteva ZDavPR.

## Končna kontrola pred produkcijo

- [ ] vzorci vseh aktivnih tipov računov so vizualno pregledani;
- [ ] seštevki in DDV so neodvisno preračunani brez binarnega plavajočega vira;
- [ ] izvirnik, popravek in delno vračilo se računovodsko ujemajo;
- [ ] račun je kupcu izročen v papirni ali elektronski obliki;
- [ ] javni prikaz ne razkriva internih UUID-jev, skrivnosti ali nepotrebnih osebnih
  podatkov;
- [ ] računovodja podpiše, kateri podatki so obvezni za vsak podprti scenarij.

Uradni povzetek sestavin: <https://spot.gov.si/sl/teme/izdajanje-racunov/> in
<https://spot.gov.si/sl/teme/vodenje-poslovnih-knjig/>.
