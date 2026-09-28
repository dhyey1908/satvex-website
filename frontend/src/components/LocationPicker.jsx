import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, LocateFixed } from 'lucide-react';
import { Modal } from './Modal';
import './LocationPicker.css';

const DEFAULT_CENTER = [20.5937, 78.9629]; // India centroid — used when geolocation is unavailable/denied
const DEFAULT_ZOOM = 5;
const LOCATED_ZOOM = 16;

// A plain CSS pin instead of Leaflet's default marker PNGs — those reference
// relative image paths that break under Vite's bundling unless separately
// configured; a DivIcon sidesteps that entirely.
const pinIcon = L.divIcon({
  className: 'location-picker-pin',
  html: '<div class="location-picker-pin-dot"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Reverse-geocodes via OpenStreetMap's Nominatim — free, no API key. This is
// a suggestion only: every field it returns stays fully editable, nothing
// here is ever submitted automatically.
async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`,
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error('Could not look up that location.');
  const data = await res.json();
  const a = data.address || {};
  return {
    line1: [a.house_number, a.road].filter(Boolean).join(' ') || a.suburb || a.neighbourhood || '',
    city: a.city || a.town || a.village || a.county || '',
    state: a.state || '',
    pincode: a.postcode || '',
  };
}

export function LocationPicker({ open, onClose, onConfirm }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [position, setPosition] = useState(null);

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
        Tap the map or drag the pin to your delivery location, then confirm — you can still edit every field
        yourself afterward.
      </p>
      {permissionDenied && (
        <p className="location-picker-hint location-picker-denied">
          Location access wasn&apos;t available — pick your spot on the map manually instead.
        </p>
      )}
      <div ref={mapRef} className="location-picker-map" />
    </Modal>
  );
}
