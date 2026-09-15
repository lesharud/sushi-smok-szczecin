import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { gallery, restaurant } from "../data";
import { useEditorialTransition } from "./useEditorialTransition";
const stories = [
  {
    title: "Przy wspólnym stole",
    text: "Rozmowy bez pośpiechu. Rolki, po które każdy sięga z ochotą. Tak zaczyna się dobry wieczór.",
  },
  {
    title: "Chwila dla siebie",
    text: "Ulubiona rolka, spokojny wieczór i chwila tylko dla Ciebie. Mała przyjemność, do której chce się wracać.",
  },
  {
    title: "Apetyt na chrupnięcie",
    text: "Krewetki w tempurze i wyrazisty akcent sosu. Dla tych, którzy lubią, gdy każdy kęs ma charakter.",
  },
];
export default function EditorialGallery({
  onOpen,
}: {
  onOpen: (index: number, trigger: HTMLButtonElement) => void;
}) {
  const transition = useEditorialTransition(0);
  const active = transition.value;
  const select = (index: number) => {
    if (index === active) return;
    void transition.change(index, index < active ? -1 : 1, [
      `/images/${gallery[index].image}-600.webp`,
      `/images/${gallery[index].image}-1000.webp`,
    ]);
  };
  const selector = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = selector.current;
    const button = el?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (el && button && el.scrollWidth > el.clientWidth) {
      const a = button.getBoundingClientRect(),
        b = el.getBoundingClientRect();
      if (a.right > b.right) el.scrollLeft += a.right - b.right + 3;
      else if (a.left < b.left) el.scrollLeft -= b.left - a.left + 3;
    }
  }, [active]);
  const touch = useRef({ x: 0, y: 0 });
  const swipedAt = useRef(0);
  const item = gallery[active];
  const story = stories[active];
  const step = (d: number) =>
    select(Math.max(0, Math.min(gallery.length - 1, active + d)));
  return (
    <section
      className="editorial-gallery shop-container"
      id="galeria"
      aria-labelledby="gallery-title"
    >
      <div className="editorial-copy">
        <p className="eyebrow">
          <span>03 /</span> MAŁE PRZYJEMNOŚCI
        </p>
        <h2 id="gallery-title">
          Smak dobrych
          <br /> <em>chwil.</em>
        </h2>
        <p className="editorial-intro">
          Przy wspólnym stole albo tylko dla siebie. Trzy małe przyjemności z
          Sushi Smok.
        </p>
        <div
          className="editorial-selector"
          ref={selector}
          role="group"
          aria-label="Wybierz zdjęcie w galerii"
        >
          {gallery.map((g, index) => (
            <button
              key={g.image}
              aria-pressed={active === index}
              disabled={transition.busy}
              onClick={() => select(index)}
            >
              <span>0{index + 1}</span>
              <span>{stories[index].title}</span>
              <ArrowUpRight size={18} />
            </button>
          ))}
        </div>
        <Link className="text-link editorial-order" to="/menu">
          Wybierz coś na swój wieczór <ArrowUpRight size={16} />
        </Link>
        <a
          className="text-link editorial-instagram"
          href={restaurant.instagram}
          target="_blank"
          rel="noopener noreferrer"
        >
          Więcej na Instagramie <ArrowUpRight size={16} />
        </a>
      </div>
      <div
        className="editorial-stage"
        {...transition.motion}
        aria-busy={transition.busy}
      >
        <button
          className="editorial-photo"
          aria-label={`Powiększ zdjęcie: ${item.alt}`}
          onClick={(e) => {
            if (!transition.busy && Date.now() - swipedAt.current > 350)
              onOpen(active, e.currentTarget);
          }}
          onTouchStart={(e) => {
            touch.current = {
              x: e.touches[0].clientX,
              y: e.touches[0].clientY,
            };
          }}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - touch.current.x,
              dy = e.changedTouches[0].clientY - touch.current.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              swipedAt.current = Date.now();
              step(dx < 0 ? 1 : -1);
            }
          }}
        >
          <img
            key={item.image}
            src={`/images/${item.image}-1000.webp`}
            srcSet={`/images/${item.image}-600.webp 600w, /images/${item.image}-1000.webp 1000w`}
            sizes="(max-width:700px) 100vw, 55vw"
            width="1000"
            height="750"
            alt={item.alt}
            loading="lazy"
          />
          <span className="editorial-enlarge">
            <Plus size={18} /> Powiększ
          </span>
        </button>
        <div className="editorial-caption" aria-live="polite">
          <div key={active}>
            <p>{story.title}</p>
            <p className="editorial-story">{story.text}</p>
          </div>
        </div>
        <div className="editorial-controls">
          <span aria-live="polite">
            0{active + 1} <i>/ 0{gallery.length}</i>
          </span>
          <div className="editorial-progress" aria-hidden="true">
            {gallery.map((g, i) => (
              <i key={g.image} className={i === active ? "active" : ""} />
            ))}
          </div>
          <div className="home-arrows">
            <button
              className="icon-control"
              aria-label="Poprzednie zdjęcie w galerii"
              disabled={transition.busy || active === 0}
              onClick={() => step(-1)}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              className="icon-control"
              aria-label="Następne zdjęcie w galerii"
              disabled={transition.busy || active === gallery.length - 1}
              onClick={() => step(1)}
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
