"use client";

import { useState } from "react";
import { LocateFixed, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/SelectField";
import { TextField } from "@/components/ui/TextField";
import { MALAYSIAN_STATES } from "@/lib/malaysia";
import {
  parseCoordinates,
  RADIUS,
  roundCoordinate,
  validCoordinates,
  type BranchValues,
  type OperatingHours,
} from "@/lib/settings/branch";
import { idle } from "@/lib/settings/form";
import { useFormAction } from "@/lib/use-form-action";
import {
  FormFeedback,
  ReadOnlyNote,
  useFieldError,
} from "@/components/forms/FormFeedback";
import { saveBranch } from "./actions";
import { GeofenceMap } from "./GeofenceMap";
import { OperatingHoursField } from "./OperatingHoursField";

const toText = (n: number | null) => (n === null ? "" : String(n));

// ORG-03: branch details, geofence (map picker + coordinates + radius) and hours.
// One accent action: Save branch.
export function BranchForm({
  branch,
  defaultState,
  canEdit,
  justCreated,
}: {
  branch: (BranchValues & { id: string }) | null;
  defaultState: string | null;
  canEdit: boolean;
  justCreated: boolean;
}) {
  const t = useTranslations("Settings.branches");
  const locale = useLocale();
  const { state, onSubmit, pending } = useFormAction(saveBranch, idle);
  const error = useFieldError(state);

  // Coordinates are text so people can type freely; the map follows valid values.
  const [lat, setLat] = useState(toText(branch?.geo_lat ?? null));
  const [lng, setLng] = useState(toText(branch?.geo_lng ?? null));
  const [radius, setRadius] = useState(
    String(branch?.geo_radius_m ?? RADIUS.default),
  );
  const [hours, setHours] = useState<OperatingHours>(
    branch?.operating_hours ?? {},
  );
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);

  const latNum = lat.trim() === "" ? NaN : Number(lat);
  const lngNum = lng.trim() === "" ? NaN : Number(lng);
  const hasPin = validCoordinates(latNum, lngNum);
  const radiusNum = Number(radius);
  const mapRadius =
    Number.isFinite(radiusNum) && radiusNum > 0 ? radiusNum : RADIUS.default;

  const pick = (newLat: number, newLng: number) => {
    setLat(String(roundCoordinate(newLat)));
    setLng(String(roundCoordinate(newLng)));
  };

  const applyPaste = () => {
    const coords = parseCoordinates(paste);
    setPasteError(!coords);
    if (coords) {
      pick(coords.lat, coords.lng);
      setPaste("");
    }
  };

  const locate = () => {
    setLocateError(false);
    if (!("geolocation" in navigator)) return setLocateError(true);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        pick(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setLocating(false);
        setLocateError(true);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {branch ? (
        <input type="hidden" name="branch_id" value={branch.id} />
      ) : null}
      {canEdit ? null : <ReadOnlyNote who="ownerHr" />}
      {justCreated && state.status === "idle" ? (
        <p role="status" className="text-meta font-medium text-primary">
          {t("created")}
        </p>
      ) : null}

      <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-6">
        <Card className="flex flex-col gap-5">
          <CardHeader
            as="h2"
            title={branch ? (branch.name ?? t("editTitle")) : t("newTitle")}
          />
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              label={t("name")}
              name="name"
              defaultValue={branch?.name ?? ""}
              error={error("name")}
              required
            />
            <SelectField
              label={t("state_code")}
              name="state_code"
              defaultValue={branch?.state_code ?? defaultState ?? ""}
              hint={t("state_codeHint")}
              error={error("state_code")}
            >
              <option value="">{t("statePlaceholder")}</option>
              {MALAYSIAN_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </SelectField>
            <TextField
              className="md:col-span-2"
              label={t("address")}
              name="address"
              defaultValue={branch?.address ?? ""}
              error={error("address")}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-5">
          <CardHeader as="h2" title={t("geofence")} />
          <p className="-mt-3 text-meta text-ink-muted">
            {canEdit ? t("geofenceIntro") : t("geofenceIntroReadOnly")}
          </p>

          <GeofenceMap
            lat={hasPin ? latNum : null}
            lng={hasPin ? lngNum : null}
            radius={mapRadius}
            onPick={pick}
            readOnly={!canEdit}
            label={t("mapLabel")}
          />

          {canEdit ? (
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Label htmlFor="paste-coordinates">{t("paste")}</Label>
                <div className="flex gap-2">
                  <Input
                    id="paste-coordinates"
                    value={paste}
                    placeholder={t("pastePlaceholder")}
                    aria-invalid={pasteError || undefined}
                    aria-describedby="paste-coordinates-hint"
                    onChange={(e) => setPaste(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyPaste();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={applyPaste}>
                    {t("pasteApply")}
                  </Button>
                </div>
                <p
                  id="paste-coordinates-hint"
                  className={
                    pasteError
                      ? "text-meta font-medium text-danger"
                      : "text-meta text-ink-muted"
                  }
                >
                  {pasteError ? t("pasteInvalid") : t("pasteHint")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 md:pb-7">
                <Button
                  type="button"
                  variant="outline"
                  onClick={locate}
                  loading={locating}
                >
                  <LocateFixed aria-hidden />
                  {locating ? t("locating") : t("useLocation")}
                </Button>
                {hasPin ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setLat("");
                      setLng("");
                    }}
                  >
                    <X aria-hidden />
                    {t("clearPin")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {locateError ? (
            <p role="alert" className="text-meta font-medium text-danger">
              {t("locationFailed")}
            </p>
          ) : null}

          <div className="grid gap-5 md:grid-cols-3">
            <TextField
              label={t("geo_lat")}
              name="geo_lat"
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              error={error("geo_lat")}
            />
            <TextField
              label={t("geo_lng")}
              name="geo_lng"
              inputMode="decimal"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              error={error("geo_lng")}
            />
            <TextField
              label={t("geo_radius_m")}
              name="geo_radius_m"
              type="number"
              inputMode="numeric"
              min={RADIUS.min}
              max={RADIUS.max}
              step={10}
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              hint={t("radiusHint")}
              error={error("geo_radius_m")}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <CardHeader as="h2" title={t("hours")} />
          <p className="text-meta text-ink-muted">{t("hoursIntro")}</p>
          <OperatingHoursField
            value={hours}
            onChange={setHours}
            disabled={!canEdit}
            error={error("operating_hours")}
          />
        </Card>
      </fieldset>

      {canEdit ? (
        <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
          <Button type="submit" variant="accent" loading={pending}>
            {t("saveBranch")}
          </Button>
          <FormFeedback state={state} />
        </div>
      ) : null}
    </form>
  );
}
