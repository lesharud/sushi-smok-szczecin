import type { FormEvent } from "react";
/** Native form feedback stays Polish, even if the browser language differs. */
export const polishValidation = {
  onInvalidCapture(event: FormEvent<HTMLFormElement>) {
    const field = event.target as HTMLInputElement;
    if (!field.validity) return;
    field.setCustomValidity(
      field.validity.valueMissing
        ? "Uzupełnij to pole."
        : field.validity.typeMismatch
          ? "Podaj poprawny adres e-mail."
          : field.validity.tooShort
            ? "Hasło musi mieć co najmniej 12 znaków."
            : field.validity.patternMismatch
              ? "Podaj kod pocztowy w formacie 70-781."
              : "Sprawdź wpisaną wartość.",
    );
  },
  onInputCapture(event: FormEvent<HTMLFormElement>) {
    (event.target as HTMLInputElement).setCustomValidity?.("");
  },
};
