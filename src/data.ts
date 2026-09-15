// Verified source URLs, limitations and image provenance: ../SOURCES.md.
export const restaurant = {
  name: "Sushi Smok", // Official name confirmed by the owner and Instagram reference.
  publicName: "Sushi Smok",
  phone: "+48 880 503 760",
  phoneHref: "tel:+48880503760",
  address: "ul. Pomarańczowa 7",
  city: "70-781 Szczecin",
  orderUrl:
    "https://wolt.com/pl/pol/szczecin-prawobrzeze/restaurant/sushi-smok",
  alternateOrderUrl: "https://www.pyszne.pl/menu/sushi-smok",
  instagram: "https://www.instagram.com/sushismok_s/",
  mapUrl:
    "https://www.google.com/maps/search/?api=1&query=Sushi+Smok+Pomara%C5%84czowa+7+Szczecin",
  openingHours: [
    { days: "Niedziela – czwartek", hours: "12:00 – 21:00" },
    { days: "Piątek – sobota", hours: "12:00 – 22:00" },
  ],
  orderHours: [
    { days: "Poniedziałek – czwartek", hours: "12:00 – 20:00" },
    { days: "Piątek – niedziela", hours: "12:00 – 21:00" },
  ],
};

export type Category = "Wybór z menu" | "Rolki" | "Zestawy";
export const dishes = [
  {
    name: "Filadelfia z łososiem",
    description: "Łosoś, kremowy serek i awokado.",
    pieces: 8,
    price: 37,
    image: "filadelfia",
    category: "Rolki",
    label: "Klasyka w dobrym wydaniu",
    featured: true,
  },
  {
    name: "Pomarańczowy smok",
    description: "Łosoś, węgorz, masago, ogórek i tamago.",
    pieces: 8,
    price: 46,
    image: "orange-smok",
    category: "Rolki",
    label: "Poznaj nasze smoki",
    featured: true,
  },
  {
    name: "Zestaw Mini Smok",
    description:
      "Trzy smoki: pomarańczowy, złoty i zielony. Po 8 sztuk każdego.",
    pieces: 24,
    price: 125,
    image: "mini-smok",
    category: "Zestawy",
    label: "Przyjemność dzielenia się",
    featured: true,
  },
  {
    name: "Double Shrimp",
    description:
      "Krewetka gotowana i w tempurze, serek, ogórek i sos słodki chili.",
    pieces: 8,
    price: 48,
    image: "double-shrimp",
    category: "Rolki",
    label: "Podwójnie krewetkowe",
    featured: false,
  },
  {
    name: "Pieczony set",
    description:
      "Pieczone rolki z krewetką, węgorzem i łososiem. Po 8 sztuk każdego rodzaju.",
    pieces: 24,
    price: 120,
    image: "baked-set",
    category: "Zestawy",
    label: "Coś na ciepło",
    featured: false,
  },
  {
    name: "Party Set",
    description: "Osiem rodzajów rolek. Zestaw na spotkanie w większym gronie.",
    pieces: 64,
    price: 299,
    image: "party-set",
    category: "Zestawy",
    label: "Dla całej ekipy",
    featured: false,
  },
] as const;

export const gallery = [
  {
    image: "party-set",
    caption: "Dobre towarzystwo. Dobry zestaw.",
    alt: "Duży Party Set z różnymi rodzajami sushi na czarnych tacach",
  },
  {
    image: "filadelfia",
    caption: "Klasyka, do której się wraca.",
    alt: "Filadelfia z łososiem, serkiem i awokado na czarnym talerzu",
  },
  {
    image: "double-shrimp",
    caption: "Krewetki? Podwójnie.",
    alt: "Rolki Double Shrimp z krewetkami na czarnym talerzu",
  },
];
