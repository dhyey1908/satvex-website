// The public page where anyone can follow a parcel by its AWB (tracking number), for every courier.
export const trackingUrl = (awb) => (awb ? `https://shiprocket.co/tracking/${encodeURIComponent(awb)}` : '');
