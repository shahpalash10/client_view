const STORAGE_KEY = 'xiberlinc_profiles'

export const profileStorage = {
  // Get all profiles
  getAllProfiles() {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : {}
  },

  // Get specific profile
  getProfile(userId) {
    const profiles = this.getAllProfiles()
    return profiles[userId] || null
  },

  // Save profile
  saveProfile(userId, profileData) {
    const profiles = this.getAllProfiles()
    profiles[userId] = {
      ...profileData,
      userId,
      lastUpdated: new Date().toISOString()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
    return profiles[userId]
  },

  // Delete profile
  deleteProfile(userId) {
    const profiles = this.getAllProfiles()
    delete profiles[userId]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  },

  // Save calibration data with PCA feature patterns
  saveCalibration(userId, calibrationData) {
    const profile = this.getProfile(userId) || { name: userId }
    
    // Store the FULL calibration data including raw predictions
    // This contains arrays of {arousal, valence, expectation} for each state
    profile.calibrationData = calibrationData
    profile.voiceCalibrationData = calibrationData
    
    // Calculate reference points from calibration
    const referencePoints = this.calculateReferencePoints(calibrationData)
    profile.referencePoints = referencePoints
    profile.voiceReferencePoints = this.calculateVoiceReferencePoints(calibrationData)
    
    // Legacy thresholds for backward compatibility
    profile.thresholds = {
      happyArousal: referencePoints.happy.arousal,
      sadArousal: referencePoints.sad.arousal
    }
    
    profile.isCalibrated = true
    profile.calibratedAt = new Date().toISOString()
    
    return this.saveProfile(userId, profile)
  },

  // Calculate reference points (averages) from calibration data
  calculateReferencePoints(calibration) {
    const { happy, sad, neutral } = calibration
    
    return {
      neutral: neutral || null,
      happy: happy || null,
      sad: sad || null
    }
  },

  // Calculate voice reference points if present (falls back to nulls)
  calculateVoiceReferencePoints(calibration) {
    const extractVoice = (entry) => {
      if (!entry) return null
      return entry.voice || null
    }

    return {
      neutral: extractVoice(calibration.neutral),
      happy: extractVoice(calibration.happy),
      sad: extractVoice(calibration.sad)
    }
  },

  // Get current active profile from session storage
  getActiveProfile() {
    const userId = sessionStorage.getItem('active_profile')
    return userId ? this.getProfile(userId) : null
  },

  // Set active profile
  setActiveProfile(userId) {
    sessionStorage.setItem('active_profile', userId)
  },

  // Clear active profile
  clearActiveProfile() {
    sessionStorage.removeItem('active_profile')
  }
}
