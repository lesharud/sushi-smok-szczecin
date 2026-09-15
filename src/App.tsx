import { useEffect, useRef, type KeyboardEvent } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowDown,
  MapPin,
  Instagram,
  X,
  ChevronLeft,
  ChevronRight,
  Fish,
  UtensilsCrossed,
  ShoppingBag,
} from "lucide-react";
import { gallery, restaurant as r } from "./data";
import Dragon from "./Dragon";
import { Link } from "react-router-dom";
import { Brand, OrderLink } from "./shop/components";
import { MenuDiscovery, SharingSets } from "./home/MenuSections";
import EditorialGallery from "./home/EditorialGallery";
import "./home/refinement.css";
import { useEditorialTransition } from "./home/useEditorialTransition";

function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;
  const elements = event.currentTarget.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), [tabindex="0"]',
  );
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

function FoodImage({
  name,
  alt,
  className = "",
  eager = false,
}: {
  name: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      className={className}
      src={`/images/${name}-1000.webp`}
      srcSet={`/images/${name}-600.webp 600w, /images/${name}-1000.webp 1000w`}
      sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 40vw"
      width="1200"
      height="646"
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
export default function App() {
  const lightbox = useEditorialTransition<number | null>(null);
  const selectedImage = lightbox.value;
  const setSelectedImage = lightbox.reset;
  const galleryDialog = useRef<HTMLDialogElement>(null);
  const galleryTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.09 },
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (selectedImage !== null) galleryDialog.current?.showModal();
    else galleryDialog.current?.close();
    document.body.style.overflow = selectedImage !== null ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedImage]);

  const closeGallery = () => {
    setSelectedImage(null);
    galleryTrigger.current?.focus();
  };
  const stepGallery = (direction: number) => {
    if (selectedImage === null) return;
    const next = (selectedImage + direction + gallery.length) % gallery.length;
    void lightbox.change(next, direction, [
      `/images/${gallery[next].image}-1000.webp`,
    ]);
  };

  return (
    <>
      <main id="main">
        <section className="hero" id="top" aria-labelledby="hero-title">
          <div className="hero-topline">
            <span>SZCZECIN · PRAWOBRZEŻE</span>
            <span>SUSHI Z CHARAKTEREM</span>
          </div>
          <h1 id="hero-title">
            <span>SUSHI</span> <span>SMOK</span>
          </h1>
          <span className="hero-title-outline" aria-hidden="true">
            SUSHI
          </span>
          <Dragon className="hero-dragon" />
          <div className="hero-art">
            <img
              className="hero-photo"
              src="/images/hero-1440.webp"
              srcSet="/images/hero-800.webp 800w, /images/hero-1440.webp 1440w"
              sizes="(max-width: 700px) 100vw, 56vw"
              width="1371"
              height="771"
              fetchPriority="high"
              alt="Sushi Smok: rolki z łososiem i krewetkami na czarnych talerzach"
            />
            <div className="hero-shade" />
            <span className="hero-photo-caption">SMAK, KTÓRY INSPIRUJE.</span>
          </div>
          <Link to="/menu" className="hero-round-cta">
            <ArrowUpRight size={32} />
            <span>Zamów online</span>
          </Link>
          <div className="hero-editorial">
            <p>
              Małe kawałki.
              <br />
              <em>Wielki apetyt.</em>
            </p>
            <div>
              <p>
                Łosoś, krewetki, ulubione rolki.
                <br />
                Dobry wieczór zaczyna się tutaj.
              </p>
              <a href="#menu" className="text-link">
                Odkryj nasze menu
                <ArrowDown size={17} />
              </a>
            </div>
          </div>
          <div className="hero-bottom">
            <a href={r.mapUrl} target="_blank" rel="noopener noreferrer">
              <MapPin size={14} />
              Pomarańczowa 7, Szczecin
            </a>
            <span>
              NA WYNOS <i /> Z DOSTAWĄ
            </span>
            <a href="#menu" className="scroll-hint">
              PRZEWIŃ, POZNAJ SMAK
              <ArrowDown size={16} />
            </a>
          </div>
        </section>
        <div className="taste-strip" aria-hidden="true">
          <span>SUSHI Z CHARAKTEREM</span>
          <span className="strip-star">✧</span>
          <em>Smak, który inspiruje.</em>
          <span className="strip-star">✧</span>
          <span>SZCZECIN</span>
          <span className="strip-star">✧</span>
          <em>Sushi Smok.</em>
        </div>

        <MenuDiscovery />
        <SharingSets />
        <section
          className="story-section"
          id="o-nas"
          aria-labelledby="story-title"
        >
          <div className="container story-grid">
            <div className="story-visual reveal">
              <FoodImage
                name="mini-smok"
                alt="Zestaw Mini Smok: rolki z łososiem, awokado i węgorzem"
              />
              <div className="story-image-label">
                <span>TRZY SMAKI. JEDEN ZESTAW.</span>
                <span>Mini Smok / 24 szt.</span>
              </div>
              <div className="story-seal" aria-hidden="true">
                <Dragon />
                <span>SUSHI SMOK · SZCZECIN</span>
              </div>
            </div>
            <div className="story-copy reveal">
              <p className="eyebrow">
                <span className="section-number">02 /</span> POZNAJ SUSHI SMOK
              </p>
              <h2 id="story-title">
                Smok z nazwy.
                <br />
                <em>Smak z charakterem.</em>
              </h2>
              <p>
                Spokojny wieczór we dwoje, spotkanie z przyjaciółmi, a może po
                prostu apetyt na coś dobrego? Wybierz swoje sushi. Reszta
                wieczoru należy do Ciebie.
              </p>
              <p>
                Na szczecińskim Prawobrzeżu znajdziesz u nas klasyczne nigiri,
                rolki z łososiem, smoki z węgorzem i awokado oraz pieczone
                zestawy. Różne smaki, jedna przyjemność dzielenia się.
              </p>
              <a className="text-link" href="#kontakt">
                Znajdziesz nas na Pomarańczowej
                <ArrowUpRight size={18} />
              </a>
            </div>
          </div>
        </section>

        <section
          className="section why-section container"
          aria-labelledby="why-title"
        >
          <div className="why-intro reveal">
            <p className="eyebrow">DOBRY SMAK TKWI W SZCZEGÓŁACH</p>
            <h2 id="why-title">
              Trzy powody.
              <br />
              <em>Jeden apetyt.</em>
            </h2>
          </div>
          <div className="why-grid">
            <article className="reveal">
              <Fish strokeWidth={1.3} />
              <h3>To, co lubisz najbardziej</h3>
              <p>
                Łosoś, krewetki, węgorz i awokado. Znane składniki w
                połączeniach, do których chce się wracać.
              </p>
            </article>
            <article className="reveal">
              <UtensilsCrossed strokeWidth={1.3} />
              <h3>Każdy ma swój smak</h3>
              <p>
                Klasyczne nigiri, chrupiąca tempura czy pieczone rolki? W naszym
                menu jest miejsce na Twój wybór.
              </p>
            </article>
            <article className="reveal">
              <ShoppingBag strokeWidth={1.3} />
              <h3>Twój stół, Twoje zasady</h3>
              <p>
                Zamów z dostawą lub wybierz odbiór. Ulubione sushi tam, gdzie
                masz ochotę spędzić wieczór.
              </p>
            </article>
          </div>
        </section>

        <EditorialGallery
          onOpen={(index, trigger) => {
            galleryTrigger.current = trigger;
            setSelectedImage(index);
          }}
        />

        <section className="order-section" aria-labelledby="order-title">
          <Dragon className="order-dragon" />
          <div className="container order-inner reveal">
            <p className="eyebrow">PLAN NA DZIŚ? JUŻ JEST.</p>
            <h2 id="order-title">
              Twój wieczór.
              <br />
              <em>Nasz Smok.</em>
            </h2>
            <p>
              Wybierz ulubione rolki. Zaproś kogoś bliskiego.
              <br />
              Zrób miejsce na dobry wieczór.
            </p>
            <OrderLink label="Zamów swój zestaw" />
            <a
              className="order-alternative"
              href={r.alternateOrderUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Wolisz Pyszne.pl? Zamów tutaj <ArrowUpRight size={14} />
            </a>
          </div>
        </section>

        <section
          className="section contact-section container"
          id="kontakt"
          aria-labelledby="contact-title"
        >
          <div className="section-heading reveal">
            <div>
              <p className="eyebrow">
                <span className="section-number">04 /</span> JESTEŚMY BLISKO
              </p>
              <h2 id="contact-title">
                Do zobaczenia.
                <br />
                <em>Do posmakowania.</em>
              </h2>
            </div>
            <p className="contact-intro">
              Szczecin, Prawobrzeże.
              <br />
              Stąd ruszają Twoje ulubione rolki.
            </p>
          </div>
          <div className="contact-grid">
            <div className="contact-details reveal">
              <div className="contact-block">
                <p className="eyebrow">NASZ ADRES</p>
                <address>
                  {r.address}
                  <br />
                  <span>{r.city}</span>
                </address>
                <a
                  className="text-link"
                  href={r.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Wyznacz trasę
                  <ArrowUpRight size={17} />
                </a>
              </div>
              <div className="contact-block">
                <p className="eyebrow">POROZMAWIAJMY</p>
                <a className="phone-link" href={r.phoneHref}>
                  {r.phone}
                </a>
                <p>Pytania o menu lub odbiór? Zadzwoń.</p>
              </div>
              <div className="contact-block hours">
                <p className="eyebrow">GODZINY OTWARCIA</p>
                {r.openingHours.map((row) => (
                  <div className="hours-row" key={row.days}>
                    <span>{row.days}</span>
                    <span>{row.hours}</span>
                  </div>
                ))}
                <p className="hours-note">
                  Godziny przyjmowania zamówień na Wolt mogą się różnić. Sprawdź
                  dostępność przy zamówieniu.
                </p>
              </div>
              <a
                href={r.instagram}
                className="text-link"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Instagram size={18} />
                @sushismok_s
                <ArrowUpRight size={17} />
              </a>
            </div>
            <a
              className="location-card reveal"
              href={r.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Otwórz lokalizację Sushi Smok, Pomarańczowa 7 w Mapach Google — nowa karta"
            >
              <div className="location-top">
                <span>SZCZECIN</span>
                <ArrowUpRight size={22} />
              </div>
              <div className="location-art" aria-hidden="true">
                <div className="location-orbit orbit-1" />
                <div className="location-orbit orbit-2" />
                <div className="location-orbit orbit-3" />
                <div className="location-pin">
                  <MapPin size={34} strokeWidth={1.25} />
                </div>
                <span className="location-name">Prawobrzeże</span>
              </div>
              <div className="location-bottom">
                <span>TU ZACZYNA SIĘ DOBRY WIECZÓR</span>
                <strong>Pomarańczowa 7</strong>
                <span className="location-directions">
                  Otwórz w Mapach Google
                  <ArrowRight size={19} />
                </span>
              </div>
            </a>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="container">
          <a
            className="footer-wordmark"
            href="#top"
            aria-label="Sushi Smok — wróć na górę"
          >
            SUSHI SMOK<span>↗</span>
          </a>
          <div className="footer-top">
            <Brand footer />
            <p>
              Małe kawałki.
              <br />
              <em>Dobre chwile.</em>
            </p>
            <a
              className="back-top"
              href="#top"
              aria-label="Wróć na górę strony"
            >
              <ArrowUpRight size={23} />
            </a>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Sushi Smok</span>
            <span>Pomarańczowa 7 · Szczecin</span>
            <div>
              <a href={r.phoneHref}>Zadzwoń</a>
              <a href={r.instagram} target="_blank" rel="noopener noreferrer">
                Instagram
                <ArrowUpRight size={13} />
              </a>
            </div>
          </div>
        </div>
      </footer>
      <dialog
        ref={galleryDialog}
        className="lightbox"
        aria-label="Galeria zdjęć sushi"
        onCancel={closeGallery}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeGallery();
        }}
        onKeyDown={(e) => {
          trapDialogFocus(e);
          if (e.key === "ArrowRight") stepGallery(1);
          if (e.key === "ArrowLeft") stepGallery(-1);
        }}
      >
        <button
          className="icon-button lightbox-close"
          aria-label="Zamknij zdjęcie"
          onClick={closeGallery}
        >
          <X />
        </button>
        {selectedImage !== null && (
          <div
            className="lightbox-content"
            {...lightbox.motion}
            aria-busy={lightbox.busy}
          >
            <img
              src={`/images/${gallery[selectedImage].image}-1000.webp`}
              width="1200"
              height="646"
              alt={gallery[selectedImage].alt}
            />
            <div className="lightbox-toolbar">
              <button
                className="icon-button"
                disabled={lightbox.busy}
                onClick={() => stepGallery(-1)}
                aria-label="Poprzednie zdjęcie"
              >
                <ChevronLeft />
              </button>
              <p aria-live="polite">
                {selectedImage + 1} / {gallery.length}
                <span>{gallery[selectedImage].caption}</span>
              </p>
              <button
                className="icon-button"
                disabled={lightbox.busy}
                onClick={() => stepGallery(1)}
                aria-label="Następne zdjęcie"
              >
                <ChevronRight />
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
