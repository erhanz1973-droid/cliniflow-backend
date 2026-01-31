# Referrals i18n Implementation Guide

## 📋 Overview
Complete internationalization (i18n) implementation for Referrals system in both Admin and Patient apps.

## 🌐 Language Files Created

### Admin App
- `i18n_admin_referrals_en.json` - English translations
- `i18n_admin_referrals_tr.json` - Turkish translations

### Patient App  
- `i18n_patient_referrals_en.json` - English translations
- `i18n_patient_referrals_tr.json` - Turkish translations

## 🔑 I18n Keys Structure

### 1️⃣ Page Header
```json
{
  "referrals": {
    "title": "Invite Friends, Earn Together",
    "subtitle": "Invite your friends. When they join the clinic, both of you earn a discount."
  }
}
```

### 2️⃣ Invite Code Section
```json
{
  "referrals": {
    "inviteCode": {
      "title": "Your Invite Code", 
      "helper": "Share this code with your friend. They should use it during registration."
    },
    "copy": "Copy",
    "share": "Share",
    "shareMessage": "Join Clinifly and get a discount!\nUse my invite code and we'll both earn a discount.\nInvite code: {{code}}"
  }
}
```

### 3️⃣ How It Works
```json
{
  "referrals": {
    "howItWorks": {
      "title": "How it works?",
      "steps": [
        "Share your invite code",
        "Your friend registers using the code", 
        "The clinic approves the request",
        "You both earn a discount"
      ]
    },
    "note": "Discount rates are determined by the clinic."
  }
}
```

### 4️⃣ Status & Actions
```json
{
  "referrals": {
    "status": {
      "title": "Your Referrals",
      "pending": "Pending",
      "approved": "Approved", 
      "rejected": "Rejected",
      "pendingDesc": "Waiting for clinic approval",
      "approvedDesc": "Discount earned",
      "rejectedDesc": "Referral was not approved"
    },
    "approve": "Approve",
    "reject": "Reject"
  }
}
```

### 5️⃣ User Labels
```json
{
  "referrals": {
    "inviter": "Inviter",
    "invited": "Invited", 
    "inviterPerson": "Person you invited",
    "invitedPerson": "Person who invited you",
    "createdAt": "Created At"
  }
}
```

### 6️⃣ Messages & Feedback
```json
{
  "referrals": {
    "copySuccess": "Invite code copied to clipboard!",
    "copyError": "Failed to copy invite code",
    "shareFailed": "Failed to share invite code",
    "noReferrals": "No referrals yet",
    "loading": "Loading referrals...",
    "approveSuccess": "Referral approved successfully!",
    "approveError": "Failed to approve referral",
    "rejectSuccess": "Referral rejected successfully!", 
    "rejectError": "Failed to reject referral"
  }
}
```

## 📱 Implementation Status

### ✅ Admin App (admin-referrals.html)
- **Title & Subtitle**: Using `data-i18n` attributes
- **Status Labels**: Dynamic i18n with fallbacks
- **Action Buttons**: Approve/Reject with i18n
- **Error Messages**: Proper i18n implementation
- **Patient Names**: ✅ Fixed (showing names instead of IDs)

### ✅ Patient App (referrals.tsx)
- **Title & Subtitle**: Using `t()` function
- **Invite Code**: Copy/Share with i18n
- **How It Works**: Modal with i18n
- **Status Display**: Pending/Approved with i18n
- **Patient Names**: ✅ Fixed (showing names instead of IDs)

## 🎯 Key Features Implemented

### 1. **Patient Names Display**
- **Before**: `1a13708e-fc4c-4be6-9314-825678283fe1`
- **After**: `Ahmet Yılmaz`
- **Backend**: JOIN queries with patient table
- **Frontend**: Fallback to ID if name not available

### 2. **Multilingual Support**
- **Languages**: English (EN), Turkish (TR)
- **Extensible**: Easy to add DE, FR, etc.
- **Cultural**: Simple, culture-independent phrases

### 3. **Marketing-Friendly Copy**
- **Clear**: "Invite Friends, Earn Together"
- **Trust-focused**: No aggressive marketing language
- **Action-oriented**: Clear CTAs for sharing

### 4. **Comprehensive Error Handling**
- **User-friendly**: Clear error messages
- **Fallbacks**: Graceful degradation
- **Logging**: Proper error tracking

## 🚀 Deployment Checklist

### Backend Changes
- ✅ Admin endpoint: Patient names JOIN
- ✅ Patient endpoint: Patient names JOIN  
- ✅ Approve/Reject: Fixed deleted_at issue
- ✅ All endpoints deployed

### Frontend Changes
- ✅ Admin HTML: i18n attributes updated
- ✅ Patient TSX: i18n keys implemented
- ✅ Language files: EN/TR created
- ✅ Fallback handling: Robust

## 📊 Expected Impact

### User Experience
- **Clarity**: Patient names instead of IDs
- **Trust**: Professional, multilingual interface
- **Engagement**: Clear referral process explanation

### Business Metrics
- **Conversion**: Higher referral completion rates
- **Retention**: Better user understanding
- **International**: Ready for multi-market expansion

## 🔧 Technical Notes

### Database Schema
```sql
-- Patient names fetched via JOIN
SELECT 
  r.*,
  inviter.full_name as inviter_name,
  invited.full_name as invited_name
FROM referrals r
LEFT JOIN patients inviter ON r.inviter_patient_id = inviter.patient_id  
LEFT JOIN patients invited ON r.invited_patient_id = invited.patient_id
```

### I18n Usage Examples
```javascript
// Admin HTML
<h1 data-i18n="referrals.title">🎁 Clinifly Admin – Referrals</h1>

// Patient TSX  
<Text style={styles.title}>{t("referrals.title")}</Text>

// Dynamic with params
t("referrals.defaultDiscounts", { inviter: 10, invited: 5 })
```

## ✅ Ready for Production

The referrals system is now:
- **Multilingual**: EN/TR ready, easily extensible
- **User-friendly**: Names instead of IDs
- **Robust**: Proper error handling and fallbacks
- **Scalable**: Easy to add new languages
- **Professional**: Clear, trustworthy messaging

**Deploy and test with real users!** 🎉
