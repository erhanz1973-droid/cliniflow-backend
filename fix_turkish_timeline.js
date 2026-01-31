// Manual fix for Turkish event types in timeline
// Run this in browser console on admin dashboard

// Override getEventTypeLabel function with Turkish translations
window.getEventTypeLabel = function(type) {
  if (!type) return type || "";
  const typeUpper = String(type).toUpperCase();
  
  // Turkish translations
  const turkishLabels = {
    "TRAVEL_EVENT": "Seyahat Etkinliği",
    "FLIGHT": "Uçuş",
    "HOTEL": "Otel",
    "AIRPORT_PICKUP": "Havalimanı Karşılama",
    "TREATMENT": "Tedavi",
    "CONSULT": "Muayene",
    "FOLLOWUP": "Kontrol",
    "LAB": "Laboratuvar / Tarama",
    "HEALTH": "Sağlık Formu",
    "APPOINTMENT": "Randevu",
    "PAYMENT": "Ödeme",
    "SURGERY": "Cerrahi",
    "CHECKUP": "Kontrol"
  };
  
  return turkishLabels[typeUpper] || type;
};

// Re-render the timeline to apply changes
if (window.renderUpcomingList && window.upcomingEvents) {
  console.log("Re-rendering timeline with Turkish labels...");
  window.renderUpcomingList(window.upcomingEvents);
} else {
  console.log("Timeline data not found. Refreshing page...");
  location.reload();
}

console.log("✅ Turkish event types applied!");
