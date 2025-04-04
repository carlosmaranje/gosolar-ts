// gosolar.ts

/**
 * Returns the time zone offset (in seconds) for a given IANA time zone string.
 * This implementation uses the Intl API to parse the short name (e.g. "GMT+2" or "GMT-05:30").
 */
function getTimeZoneOffset(timeZoneId: string): number {
    try {
        const date = new Date();
        // Format the date to get a string containing the GMT offset
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timeZoneId,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZoneName: 'short'
        });
        const parts = formatter.formatToParts(date);
        const tzPart = parts.find(p => p.type === 'timeZoneName');
        if (!tzPart) {
            throw new Error('Invalid time zone');
        }
        // Match GMT offset patterns such as "GMT+2" or "GMT-05:30"
        const regex = /GMT([+-]\d{1,2})(?::(\d{2}))?/;
        const match = tzPart.value.match(regex);
        if (!match) {
            throw new Error('Cannot parse timezone offset');
        }
        const hours = parseInt(match[1], 10);
        const minutes = match[2] ? parseInt(match[2], 10) : 0;
        return hours * 3600 + minutes * 60;
    } catch (err) {
        throw new Error(`Error getting time zone offset: ${err}`);
    }
}

export class SolarCalculation {
    private latitude: number; // in degrees
    private longitude: number; // in degrees
    private date: Date; // JavaScript Date object
    private dayTime: number; // fractional time of day (0 to 1)
    private timeZoneOffset: number; // in hours (converted from seconds)

    /**
     * The constructor is private. Use the static Calculator method to create an instance.
     */
    private constructor(
        latitude: number,
        longitude: number,
        dayTime: number,
        date: Date,
        timeZoneOffsetSec: number
    ) {
        this.latitude = latitude;
        this.longitude = longitude;
        this.date = date;
        this.dayTime = dayTime;
        // convert seconds to hours
        this.timeZoneOffset = timeZoneOffsetSec / 3600;
    }

    /**
     * Factory function which validates and returns a new SolarCalculation instance.
     */
    public static Calculator(
        latitude: number,
        longitude: number,
        dayTime: number,
        timeZone: string,
        date: Date
    ): SolarCalculation {
        const tzOffsetSec = getTimeZoneOffset(timeZone);
        const sc = new SolarCalculation(latitude, longitude, dayTime, date, tzOffsetSec);
        sc.validate();
        return sc;
    }

    // ------------------------
    // Setters
    // ------------------------

    public setLatitude(lat: number): void {
        if (lat < -90 || lat > 90) {
            throw new Error("Latitude must be between -90 and 90 degrees");
        }
        this.latitude = lat;
    }

    public setLongitude(lon: number): void {
        if (lon < -180 || lon > 180) {
            throw new Error("Longitude must be between -180 and 180 degrees");
        }
        this.longitude = lon;
    }

    public setDate(date: Date): void {
        if (isNaN(date.getTime())) {
            throw new Error("Invalid date provided");
        }
        this.date = date;
    }

    public setDayTime(dayTime: number): void {
        if (dayTime < 0 || dayTime > 1) {
            throw new Error("dayTime must be between 0 and 1");
        }
        this.dayTime = dayTime;
    }

    public setTimeZone(timeZone: string): void {
        const tzOffsetSec = getTimeZoneOffset(timeZone);
        this.timeZoneOffset = tzOffsetSec / 3600;
    }

    // ------------------------
    // Getters
    // ------------------------

    public getLatitude(): number {
        return this.latitude;
    }

    public getLongitude(): number {
        return this.longitude;
    }

    public getDate(): Date {
        return this.date;
    }

    public getDayTime(): number {
        return this.dayTime;
    }

    public getTimeZoneOffset(): number {
        return this.timeZoneOffset;
    }

    public getTimeZone(): number {
        return this.timeZoneOffset;
    }

    // ------------------------
    // Helper functions: radians & degrees
    // ------------------------

    private toRadians(degrees: number): number {
        return degrees * (Math.PI / 180);
    }

    private toDegrees(radians: number): number {
        return radians * (180 / Math.PI);
    }

    private roundTo(value: number, decimals: number): number {
        const factor = Math.pow(10, decimals);
        return Math.round(value * factor) / factor;
    }

    // ------------------------
    // Julian Day and Century Calculations
    // ------------------------

    /**
     * JulianDay calculates the Julian Day number for the current date.
     */
    public JulianDay(): number {
        const startEpoch = 2415020.5;
        // Create a Date object for 1900-01-01 UTC
        const epoch = new Date(Date.UTC(1900, 0, 1, 0, 0, 0));
        // Use the provided date directly
        const parsedDate = this.date;
        if (isNaN(parsedDate.getTime())) {
            return 0;
        }
        // Calculate days elapsed from epoch
        const elapsedMs = parsedDate.getTime() - epoch.getTime();
        const days = elapsedMs / (1000 * 60 * 60 * 24);
        return days + startEpoch + (this.dayTime - this.timeZoneOffset / 24);
    }

    /**
     * JulianCentury calculates the number of Julian centuries since J2000.0.
     */
    public JulianCentury(): number {
        return (this.JulianDay() - 2451545) / 36525;
    }

    // ------------------------
    // Solar Position Calculations
    // ------------------------

    public GeomMeanLongSun(): number {
        const jCent = this.JulianCentury();
        return (280.46646 + jCent * (36000.76983 + jCent * 0.0003032)) % 360;
    }

    public GeomMeanAnomSun(): number {
        const jCent = this.JulianCentury();
        return 357.52911 + jCent * (35999.05029 - 0.0001537 * jCent);
    }

    public EccentEarthOrbit(): number {
        const jCent = this.JulianCentury();
        return 0.016708634 - jCent * (0.000042037 + 0.0000001267 * jCent);
    }

    public EquationOfTime(): number {
        const geomMeanLongSun = this.GeomMeanLongSun();
        const eccentEarthOrbit = this.EccentEarthOrbit();
        const varY = 0.043031509;

        const gmlRad = 2 * this.toRadians(geomMeanLongSun);
        const gmaRad = this.toRadians(this.GeomMeanAnomSun());

        const gmlComp = varY * Math.sin(gmlRad);
        const gmaComp = 2 * eccentEarthOrbit * Math.sin(gmaRad);
        const eccComp = 4 * eccentEarthOrbit * varY * Math.sin(gmaRad) * Math.cos(gmlRad);

        const varYComp = 0.5 * Math.pow(varY, 2) * Math.sin(4 * this.toRadians(geomMeanLongSun));
        const eccSqComp = 1.25 * Math.pow(eccentEarthOrbit, 2) * Math.sin(2 * gmaRad);

        const formula = 4 * this.toDegrees(gmlComp - gmaComp + eccComp - varYComp - eccSqComp);
        return formula;
    }

    public SolarNoon(): number {
        return (720 - 4 * this.longitude - this.EquationOfTime() + this.timeZoneOffset * 60) / 1440;
    }

    public SunEquationOfCenter(): number {
        const meanAnomaly = this.GeomMeanAnomSun();
        const jC = this.JulianCentury();

        const term1 = Math.sin(this.toRadians(meanAnomaly)) * (1.914602 - jC * (0.004817 + 0.000014 * jC));
        const term2 = Math.sin(this.toRadians(2 * meanAnomaly)) * (0.019993 - 0.000101 * jC);
        const term3 = Math.sin(this.toRadians(3 * meanAnomaly)) * 0.000289;

        return term1 + term2 + term3;
    }

    public SunTrueLongitude(): number {
        return this.GeomMeanLongSun() + this.SunEquationOfCenter();
    }

    public TrueSolarTime(): number {
        const result = this.dayTime * 1440 + this.EquationOfTime() + 4 * this.longitude - 60 * this.timeZoneOffset;
        return result % 1440;
    }

    public SunApparentLongitude(): number {
        const sunTrueLongitude = this.SunTrueLongitude();
        const jC = this.JulianCentury();
        return sunTrueLongitude - 0.00569 - 0.00478 * Math.sin(this.toRadians(125.04 - 1934.136 * jC));
    }

    public MeanObliqEcliptic(): number {
        const jC = this.JulianCentury();
        const term2 = 26.0 + ((21.448 - jC * (46.815 + jC * (0.00059 - jC * 0.001813))) / 60.0);
        return 23.0 + term2 / 60.0;
    }

    public ObliqueCorrection(): number {
        const jC = this.JulianCentury();
        const moe = this.MeanObliqEcliptic();
        const angle = 125.04 - 1934.136 * jC;
        return moe + 0.00256 * Math.cos(this.toRadians(angle));
    }

    public SolarDeclination(): number {
        const oblCorr = this.toRadians(this.ObliqueCorrection());
        const sunAppLon = this.toRadians(this.SunApparentLongitude());
        const declination = Math.asin(Math.sin(oblCorr) * Math.sin(sunAppLon));
        return this.toDegrees(declination);
    }

    public SunHourAngle(): number {
        return (this.TrueSolarTime() / 4) - 180;
    }

    public HourAngleSunrise(): number {
        const declination = this.toRadians(this.SolarDeclination());
        const latRad = this.toRadians(this.latitude);
        const num = Math.cos(this.toRadians(90.833));
        const cos = Math.cos(latRad) * Math.cos(declination);
        const tang = Math.tan(latRad) * Math.tan(declination);
        const hourAngle = Math.acos(num / cos - tang);
        return this.toDegrees(hourAngle);
    }

    public SolarZenithAngle(): number {
        const declination = this.toRadians(this.SolarDeclination());
        const latRad = this.toRadians(this.latitude);
        const hourAngle = this.toRadians(this.SunHourAngle());
        const sinVal = Math.sin(latRad) * Math.sin(declination);
        const cosVal = Math.cos(latRad) * Math.cos(declination) * Math.cos(hourAngle);
        return this.toDegrees(Math.acos(sinVal + cosVal));
    }

    public SolarAzimuthAngle(): number {
        const hourAngle = this.SunHourAngle();
        const latRad = this.toRadians(this.latitude);
        const zenithRad = this.toRadians(this.SolarZenithAngle());
        const declination = this.toRadians(this.SolarDeclination());

        const num = (Math.sin(latRad) * Math.cos(zenithRad)) - Math.sin(declination);
        const cosSin = Math.cos(latRad) * Math.sin(zenithRad);
        const formula = this.toDegrees(Math.acos(num / cosSin));

        let mod: number;
        if (hourAngle > 0) {
            mod = formula + 180;
        } else {
            mod = 540 - formula;
        }
        return mod % 360;
    }

    public SolarIncidenceAngle(): number {
        return 90 - this.SolarZenithAngle();
    }

    public IncidenceOnTiltedSurface(surfaceAngle: number, surfaceAzimuth: number): number {
        const latRad = this.toRadians(this.latitude);
        const declRad = this.toRadians(this.SolarDeclination());
        const azimuthRad = this.toRadians(surfaceAzimuth);
        const surfaceAngleRad = this.toRadians(surfaceAngle);
        const hourAngleRad = this.toRadians(this.SunHourAngle());

        const seasonalTilt = Math.sin(latRad) * Math.sin(declRad) * Math.cos(surfaceAngleRad);
        const azmTerm = Math.cos(latRad) * Math.sin(declRad) * Math.cos(azimuthRad) * Math.sin(surfaceAngleRad);
        const hourTerm = Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngleRad) * Math.cos(surfaceAngleRad);
        const hourAzim = Math.sin(latRad) * Math.cos(declRad) * Math.cos(hourAngleRad) * Math.sin(surfaceAngleRad) * Math.cos(azimuthRad);
        const declAzim = Math.cos(declRad) * Math.sin(hourAngleRad) * Math.sin(surfaceAngleRad) * Math.sin(azimuthRad);

        const cosAng = seasonalTilt - azmTerm + hourTerm + hourAzim + declAzim;
        const angle = Math.acos(cosAng);
        return this.toDegrees(angle);
    }

    /**
     * Returns sunrise and sunset times (in hours of solar time) as an object.
     */
    public SunriseAndSunset(): { sunrise: number; sunset: number } {
        const solarNoon = this.SolarNoon();
        const hourAngle = this.HourAngleSunrise();
        const sunrise = (solarNoon * 360 - hourAngle) / 15;
        const sunset = (solarNoon * 360 + hourAngle) / 15;
        return { sunrise, sunset };
    }

    public DayLength(): number {
        const { sunrise, sunset } = this.SunriseAndSunset();
        return sunset - sunrise;
    }

    public SunriseTime(): number {
        return this.SunriseAndSunset().sunrise;
    }

    public SunsetTime(): number {
        return this.SunriseAndSunset().sunset;
    }

    public EffectiveIrradiance(horizontalIrradiance: number, incidenceAngleDeg: number): number {
        const cosineFactor = Math.cos(this.toRadians(incidenceAngleDeg));
        return horizontalIrradiance * (cosineFactor < 0 ? 0 : cosineFactor);
    }

    // ------------------------
    // Additional Helper Functions
    // ------------------------

    /**
     * Returns the standard meridian for a given longitude.
     */
    private standardMeridian(longitude: number): number {
        const ceil = Math.ceil(longitude / 15) * 15;
        const floor = Math.floor(longitude / 15) * 15;
        return Math.abs(longitude - ceil) < Math.abs(longitude - floor) ? ceil : floor;
    }

    /**
     * Returns the day of the year for the stored date.
     */
    private dayOfYear(date: Date): number {
        const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 0));
        const diff = date.getTime() - start.getTime();
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    /**
     * Returns a formatted date string ("YYYY-MM-DD") from a given day of the year.
     * If day or year are invalid, uses the current date/year.
     */
    private toDateFormatted(day: number, year: number): string {
        const now = new Date();
        if (day === -1 || day > 366) {
            day = this.dayOfYear(now);
        }
        if (year === -1) {
            year = now.getUTCFullYear();
        }
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        startOfYear.setUTCDate(startOfYear.getUTCDate() + day - 1);
        return startOfYear.toISOString().slice(0, 10);
    }

    // ------------------------
    // Validation
    // ------------------------

    private validate(): void {
        if (this.latitude < -90 || this.latitude > 90) {
            throw new Error("Invalid latitude: must be between -90 and 90");
        }
        if (this.longitude < -180 || this.longitude > 180) {
            throw new Error("Invalid longitude: must be between -180 and 180");
        }
        if (isNaN(this.date.getTime())) {
            throw new Error("Invalid date provided");
        }
        if (this.timeZoneOffset < -12 || this.timeZoneOffset > 14) {
            throw new Error("Invalid time zone: must be between -12 and 14");
        }
        if (this.dayTime < 0 || this.dayTime > 1) {
            throw new Error("Invalid dayTime: must be between 0 and 1");
        }
    }
}
