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

// LocationIQ (free tier, no card, 5,000 req/day) is the primary provider —
// noticeably better accuracy for Indian addresses than raw Nominatim. Falls
// back to OpenStreetMap's Nominatim (free, no key, just rate-limited) if
// LocationIQ is unreachable/rate-limited/not configured, so address lookup
// never fully breaks.
async function geocodeSearch(query) {
  if (LOCATIONIQ_KEY) {
    try {
      const res = await fetch(
        `https://api.locationiq.com/v1/autocomplete?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(
          query
        )}&countrycodes=in&limit=5&format=json`
      );
      if (res.ok) {
        const data = await res.json();
        return (Array.isArray(data) ? data : []).map((item) => ({
          label: item.display_name,
          lat: Number(item.lat),
          lng: Number(item.lon),
          address: addressFromComponents(item.address),
        }));
      }
    } catch {
      // fall through to Nominatim below
    }
  }

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=in&limit=5&q=${encodeURIComponent(
      query
    )}`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (Array.isArray(data) ? data : []).map((item) => ({
    label: item.display_name,
    lat: Number(item.lat),
    lng: Number(item.lon),
    address: addressFromComponents(item.address),
  }));
}

async function reverseGeocode(lat, lng) {
  if (LOCATIONIQ_KEY) {
    try {
      const res = await fetch(`https://api.locationiq.com/v1/reverse?key=${LOCATIONIQ_KEY}&lat=${lat}&lon=${lng}&format=json`);
      if (res.ok) {
        const data = await res.json();
        return addressFromComponents(data.address);
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

export function LocationPicker({ open, onClose, onConfirm }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [position, setPosition] = useState(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open || !mapRef.current || mapInstanceRef.current) return undefined;

    const map = L.map(mapRef.current, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker(DEFAULT_CENTER, { icon: pinIcon, draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng();
      setPosition({ lat, lng });
    });
    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;

    // Offer the user's real location on open, but never force it — if
    // permission is denied or unavailable, the map just stays at the
    // default center and the customer picks manually.
    if (navigator.geolocation) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          map.setView([latitude, longitude], LOCATED_ZOOM);
          marker.setLatLng([latitude, longitude]);
          setPosition({ lat: latitude, lng: longitude });
          setLocating(false);
        },
        () => {
          setPermissionDenied(true);
          setLocating(false);
        },
        { timeout: 8000 }
      );
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
    }
  }, [open]);

  function handleSearchChange(e) {
    const value = e.target.value;
    setQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await geocodeSearch(value.trim());
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
  }

  function handleSelectSuggestion(result) {
    setSuggestions([]);
    setQuery(result.label);
    setPosition({ lat: result.lat, lng: result.lng });
    if (mapInstanceRef.current && markerRef.current) {
      mapInstanceRef.current.setView([result.lat, result.lng], LOCATED_ZOOM);
      markerRef.current.setLatLng([result.lat, result.lng]);
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation || !mapInstanceRef.current || !markerRef.current) return;
    setLocating(true);
    setPermissionDenied(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapInstanceRef.current.setView([latitude, longitude], LOCATED_ZOOM);
        markerRef.current.setLatLng([latitude, longitude]);
        setPosition({ lat: latitude, lng: longitude });
        setLocating(false);
      },
      () => {
        setPermissionDenied(true);
        setLocating(false);
      },
      { timeout: 8000 }
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
      {permissionDenied && (
        <p className="location-picker-hint location-picker-denied">
          Location access wasn&apos;t available — pick your spot on the map manually instead.
        </p>
      )}

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
            {suggestions.map((s, i) => (
              <li key={i}>
                <button type="button" onClick={() => handleSelectSuggestion(s)}>
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div ref={mapRef} className="location-picker-map" />
    </Modal>
  );
}
