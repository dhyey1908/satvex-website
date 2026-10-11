import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, LocateFixed, Search } from 'lucide-react';
import { Modal } from './Modal';
import './LocationPicker.css';

const DEFAULT_CENTER = [20.5937, 78.9629]; // India centroid — used when geolocation is unavailable/denied
const DEFAULT_ZOOM = 5;
const LOCATED_ZOOM = 16;
const SEARCH_DEBOUNCE_MS = 400;

const LOCATIONIQ_KEY = import.meta.env.VITE_LOCATIONIQ_KEY;

// A plain CSS pin instead of Leaflet's default marker PNGs — those reference
// relative image paths that break under Vite's bundling unless separately
// configured; a DivIcon sidesteps that entirely.
const pinIcon = L.divIcon({
  className: 'location-picker-pin',
  html: '<div class="location-picker-pin-dot"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function addressFromComponents(a = {}) {
  return {
    line1: [a.house_number, a.road].filter(Boolean).join(' ') || a.suburb || a.neighbourhood || '',
    city: a.city || a.town || a.village || a.county || '',
    state: a.state || '',
    pincode: a.postcode || '',
  };
}

// Rough match-quality label from what the result's address actually has —
// LocationIQ's autocomplete doesn't return an explicit confidence score, so
// this is a proxy: a result with a house number/road is a real street-level
// match; one that only resolves to a city/area is approximate.
function precisionLabel(address) {
  if (!address) return null;
  if (address.line1) return 'Exact address';
  if (address.city || address.pincode) return 'Approximate area';
  return null;
}

// LocationIQ's "no match" response is HTTP 200 with {"error": "..."} — NOT
// an empty array — so a naive res.ok check treats it as "done, zero
// results" and never tries the fallback provider. This parses the response
// fully and only treats an actual array as a real result set; anything
// else (the error shape, a 401 for a bad key, a 429 rate limit) falls
// through to Nominatim.
async function fetchLocationIq(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data)) {
    const reason =
      res.status === 401 || res.status === 403
        ? 'invalid-token'
        : res.status === 429
        ? 'rate-limited'
        : 'no-results';
    return { ok: false, reason };
  }
  return { ok: true, data };
}

function mapLocationIqResults(data) {
  return data.map((item) => ({
    label: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
    address: addressFromComponents(item.address),
  }));
}

// LocationIQ (free tier, no card, 5,000 req/day) is the primary provider —
// noticeably better accuracy for Indian addresses than raw Nominatim. Falls
// back to OpenStreetMap's Nominatim (free, no key, just rate-limited) if
// LocationIQ is unreachable/rate-limited/not configured/returns no match,
// so address lookup never fully breaks. Returns { results, error } —
// error is only set when BOTH providers genuinely failed (not for a
// legitimate zero-result search), so the UI can tell "no matches" apart
// from "search is temporarily unavailable."
async function geocodeSearch(query) {
  if (LOCATIONIQ_KEY) {
    try {
      const result = await fetchLocationIq(
        `https://api.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(
          query
        )}&countrycodes=in&limit=5&format=json`
      );
      if (result.ok) return { results: mapLocationIqResults(result.data), error: null };
      // 'no-results' falls through to try Nominatim too, in case it has
      // data LocationIQ doesn't. 'invalid-token'/'rate-limited' also fall
      // through — the fallback may still work even if LocationIQ itself is
      // misconfigured or temporarily throttled.
    } catch {
      // network error — fall through to Nominatim below
    }
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=in&limit=5&q=${encodeURIComponent(
        query
      )}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return { results: [], error: 'Search is temporarily unavailable. Please try again.' };
    const data = await res.json();
    return {
      results: (Array.isArray(data) ? data : []).map((item) => ({
        label: item.display_name,
        lat: Number(item.lat),
        lng: Number(item.lon),
        address: addressFromComponents(item.address),
      })),
      error: null,
    };
  } catch {
    return { results: [], error: 'Search is temporarily unavailable. Please check your connection and try again.' };
  }
}

async function reverseGeocode(lat, lng) {
  if (LOCATIONIQ_KEY) {
    try {
      const res = await fetch(`https://api.locationiq.com/v1/reverse?key=${LOCATIONIQ_KEY}&lat=${lat}&lon=${lng}&format=json`);
      if (res.ok) {
        const data = await res.json();
        if (data && !data.error) return addressFromComponents(data.address);
      }
    } catch {
      // fall through to Nominatim below
    }
  }

  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('Could not look up that location.');
  const data = await res.json();
  return addressFromComponents(data.address);
}

// Maps the browser's GeolocationPositionError codes to a specific, helpful
// message instead of one generic "didn't work" string, per the standard
// error codes: https://developer.mozilla.org/docs/Web/API/GeolocationPositionError
function geolocationErrorMessage(err) {
  if (!navigator.geolocation) return 'Your browser does not support location detection.';
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return 'Location detection requires a secure (https) connection.';
  }
  switch (err?.code) {
    case 1: // PERMISSION_DENIED
      return 'Location access was denied. Pick your spot on the map manually instead.';
    case 2: // POSITION_UNAVAILABLE
      return "Your location couldn't be determined right now. Pick your spot on the map manually instead.";
    case 3: // TIMEOUT
      return 'Location detection timed out. Pick your spot on the map manually instead.';
    default:
      return 'Location access was not available — pick your spot on the map manually instead.';
  }
}

const GEOLOCATION_OPTIONS = { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 };

export function LocationPicker({ open, onClose, onConfirm }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [accuracyMeters, setAccuracyMeters] = useState(null);
  const [position, setPosition] = useState(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  useEffect(() => {
    if (!open || !mapRef.current || mapInstanceRef.current) return undefined;

    const map = L.map(mapRef.current, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, zoomControl: true });
    // LocationIQ's own "streets" tiles have noticeably more detail/labels
    // than plain OpenStreetMap's default style — falls back to OSM tiles if
    // no key is configured.
    if (LOCATIONIQ_KEY) {
      L.tileLayer(`https://{s}-tiles.locationiq.com/v3/streets/r/{z}/{x}/{y}.png?key=${LOCATIONIQ_KEY}`, {
        attribution: '&copy; OpenStreetMap contributors, &copy; LocationIQ',
        subdomains: 'abc',
        maxZoom: 19,
      }).addTo(map);
    } else {
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
    }

    const marker = L.marker(DEFAULT_CENTER, { icon: pinIcon, draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng();
      setPosition({ lat, lng });
      setAccuracyMeters(null); // manually placed — no GPS accuracy figure applies
    });
    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
      setAccuracyMeters(null);
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    // Offer the user's real location on open, but never force it — if
    // permission is denied or unavailable, the map just stays at the
    // default center and the customer picks manually. enableHighAccuracy
    // asks for GPS-grade positioning rather than a coarse network/WiFi
    // estimate, and maximumAge: 0 refuses a cached stale position — both
    // needed so this is the device's actual current location, not an
    // approximate one silently reused from an earlier page load.
    if (navigator.geolocation) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          map.setView([latitude, longitude], LOCATED_ZOOM);
          marker.setLatLng([latitude, longitude]);
          setPosition({ lat: latitude, lng: longitude });
          setAccuracyMeters(accuracy);
          setLocating(false);
        },
        (err) => {
          setLocationError(geolocationErrorMessage(err));
          setLocating(false);
        },
        GEOLOCATION_OPTIONS
      );
    } else {
      setLocationError(geolocationErrorMessage());
    }

    // Leaflet needs an explicit size recalculation once it's actually
    // visible — it's mounted inside an animated modal, so its container has
    // no real dimensions at the instant map.setView above would otherwise run.
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSuggestions([]);
      setSearchError(null);
    }
  }, [open]);

  function handleSearchChange(e) {
    const value = e.target.value;
    setQuery(value);
    // Typing again means whatever was pinned/selected before is stale —
    // require a fresh explicit selection rather than leaving the old
    // marker position silently associated with new, unconfirmed text.
    setSearchError(null);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { results, error } = await geocodeSearch(value.trim());
        setSuggestions(results);
        setSearchError(results.length === 0 ? error : null);
      } catch {
        setSuggestions([]);
        setSearchError('Search is temporarily unavailable. Please try again.');
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  // Only ever called from an explicit click on a suggestion — search alone
  // never moves the marker or fills the address, per spec.
  function handleSelectSuggestion(result) {
    setSuggestions([]);
    setSearchError(null);
    setQuery(result.label);
    setPosition({ lat: result.lat, lng: result.lng });
    setAccuracyMeters(null); // a searched point has no GPS accuracy figure
    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.setView([result.lat, result.lng], LOCATED_ZOOM);
      markerRef.current.setLatLng([result.lat, result.lng]);
    }
  }

  function handleUseMyLocation() {
    if (!mapInstanceRef.current || !markerRef.current) return;
    if (!navigator.geolocation) {
      setLocationError(geolocationErrorMessage());
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        mapInstanceRef.current.setView([latitude, longitude], LOCATED_ZOOM);
        markerRef.current.setLatLng([latitude, longitude]);
        setPosition({ lat: latitude, lng: longitude });
        setAccuracyMeters(accuracy);
        setLocating(false);
      },
      (err) => {
        setLocationError(geolocationErrorMessage(err));
        setLocating(false);
      },
      GEOLOCATION_OPTIONS
    );
  }

  async function handleConfirm() {
    if (!position) return;
    setResolving(true);
    try {
      const address = await reverseGeocode(position.lat, position.lng);
      onConfirm(address);
    } catch {
      // Reverse geocoding failed (offline, rate-limited, etc.) — still let
      // the customer proceed and fill the form manually rather than
      // trapping them behind a failed lookup.
      onConfirm({});
    } finally {
      setResolving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pin Your Location"
      footer={
        <div className="location-picker-footer">
          <button type="button" className="btn btn-outline btn-sm" onClick={handleUseMyLocation} disabled={locating}>
            {locating ? <Loader2 size={14} className="btn-spinner" /> : <LocateFixed size={14} />}
            Use My Location
          </button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={!position || resolving}>
            {resolving ? <Loader2 size={16} className="btn-spinner" /> : 'Confirm Location'}
          </button>
        </div>
      }
    >
      <p className="location-picker-hint">
        Search for an address, or tap the map/drag the pin — you can still edit every field yourself afterward.
      </p>
      {locationError && <p className="location-picker-hint location-picker-denied">{locationError}</p>}

      <div className="location-picker-search">
        <Search size={16} className="location-picker-search-icon" />
        <input
          type="text"
          value={query}
          onChange={handleSearchChange}
          placeholder="Search for an address, area, or landmark…"
          className="location-picker-search-input"
        />
        {searching && <Loader2 size={14} className="btn-spinner location-picker-search-spinner" />}
        {suggestions.length > 0 && (
          <ul className="location-picker-suggestions">
            {suggestions.map((s, i) => {
              const precision = precisionLabel(s.address);
              return (
                <li key={i}>
                  <button type="button" onClick={() => handleSelectSuggestion(s)}>
                    <span>{s.label}</span>
                    {precision && <span className="location-picker-suggestion-precision">{precision}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {!searching && searchError && <p className="location-picker-hint location-picker-denied">{searchError}</p>}

      <div ref={mapRef} className="location-picker-map" />
      {accuracyMeters != null && (
        <p className="location-picker-hint" style={{ marginTop: 8, marginBottom: 0 }}>
          Accuracy: within ~{Math.round(accuracyMeters)}m of this pin
        </p>
      )}
    </Modal>
  );
}
