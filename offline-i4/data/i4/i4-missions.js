/* GENERATED FILE — do not edit by hand.
   Rebuild with: node tools/build-i4.js
   Source: NASA OSDR, Inspiration4 (OSD-569, OSD-575) — public processed data.
   Values are unmodified apart from unit scaling (see tools/build-i4.js).
   Cells failing the plausibility screen are kept in entry.flags and excluded
   from scoring; they are listed in meta.quarantined. */
window.CC_I4 = {
  "meta": {
    "source": "NASA Open Science Data Repository (OSDR) — Inspiration4 mission",
    "page": "https://www.nasa.gov/osdr-latest-news-i4-mission-datasets/",
    "studies": [
      {
        "id": "OSD-569",
        "title": "Whole blood — complete blood count",
        "url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-569"
      },
      {
        "id": "OSD-575",
        "title": "Blood serum — metabolic panel, immune and cardiovascular EvePanels",
        "url": "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575"
      }
    ],
    "generated": "2026-11-15",
    "timepoints": [
      "L-92",
      "L-44",
      "L-3",
      "R+1",
      "R+45",
      "R+82",
      "R+194"
    ],
    "inFlightDays": 3,
    "crew": [
      {
        "id": "C001",
        "label": "C001"
      },
      {
        "id": "C002",
        "label": "C002"
      },
      {
        "id": "C003",
        "label": "C003"
      },
      {
        "id": "C004",
        "label": "C004"
      }
    ],
    "note": "Public processed data only. Vitals (blood pressure, heart rate, core temperature, sleep, mood) were not part of these releases and are therefore absent — never imputed.",
    "quarantined": [
      {
        "crew": "C003",
        "timepoint": "L-92",
        "metric": "neutrophils",
        "value": 10.1,
        "reason": "outside the plausible range for an ambulatory adult (200–30000)"
      },
      {
        "crew": "C003",
        "timepoint": "L-92",
        "metric": "lymphocytes",
        "value": 6826,
        "reason": "inconsistent with the reported lymphocytes (20.8% of 9.6 K/µL ≈ 1997)"
      },
      {
        "crew": "C003",
        "timepoint": "L-92",
        "metric": "platelets",
        "value": 12.9,
        "reason": "outside the plausible range for an ambulatory adult (30–1200)"
      },
      {
        "crew": "C002",
        "timepoint": "R+45",
        "metric": "glucose",
        "value": 44,
        "reason": "outside the plausible range for an ambulatory adult (50–500)"
      },
      {
        "crew": "C003",
        "timepoint": "R+45",
        "metric": "glucose",
        "value": 36,
        "reason": "outside the plausible range for an ambulatory adult (50–500)"
      },
      {
        "crew": "C004",
        "timepoint": "R+45",
        "metric": "glucose",
        "value": 43,
        "reason": "outside the plausible range for an ambulatory adult (50–500)"
      }
    ]
  },
  "refs": {
    "wbc": {
      "lo": 3.8,
      "hi": 10.8,
      "samples": 28
    },
    "neutrophils": {
      "lo": 1500,
      "hi": 7800,
      "samples": 27
    },
    "lymphocytes": {
      "lo": 850,
      "hi": 3900,
      "samples": 27
    },
    "hemoglobin": {
      "lo": 13.2,
      "hi": 17.1,
      "samples": 28
    },
    "platelets": {
      "lo": 140,
      "hi": 400,
      "samples": 27
    },
    "glucose": {
      "lo": 65,
      "hi": 99,
      "samples": 25
    },
    "potassium": {
      "lo": 3.5,
      "hi": 5.3,
      "samples": 28
    },
    "albumin": {
      "lo": 3.6,
      "hi": 5.1,
      "samples": 28
    },
    "alt": {
      "lo": 9,
      "hi": 46,
      "samples": 28
    },
    "creatinine": {
      "lo": 0.6,
      "hi": 1.35,
      "samples": 28
    }
  },
  "crews": {
    "C001": {
      "id": "C001",
      "sex": "M",
      "baseline": {
        "crp": 5.132,
        "fibrinogen": 3208.77,
        "il6": 2.87,
        "il10": 6.64,
        "tnfa": 62.39
      },
      "entries": [
        {
          "day": -92,
          "timepoint": "L-92",
          "phase": "preflight",
          "values": {
            "wbc": 5.4,
            "neutrophils": 2349,
            "lymphocytes": 2241,
            "hemoglobin": 14.1,
            "platelets": 241,
            "glucose": 83,
            "potassium": 4.6,
            "albumin": 5,
            "alt": 15,
            "creatinine": 1.24,
            "crp": 18.385,
            "fibrinogen": 3208.77,
            "il6": 2.87,
            "il10": 6.64,
            "tnfa": 62.39
          },
          "flags": {}
        },
        {
          "day": -44,
          "timepoint": "L-44",
          "phase": "preflight",
          "values": {
            "wbc": 5.5,
            "neutrophils": 2998,
            "lymphocytes": 1859,
            "hemoglobin": 14.9,
            "platelets": 237,
            "glucose": 80,
            "potassium": 4.2,
            "albumin": 5,
            "alt": 16,
            "creatinine": 1.1,
            "crp": 2.191,
            "fibrinogen": 5707.32,
            "il6": 2.58,
            "il10": 3.44,
            "tnfa": 60.14
          },
          "flags": {}
        },
        {
          "day": -3,
          "timepoint": "L-3",
          "phase": "preflight",
          "values": {
            "wbc": 7,
            "neutrophils": 3570,
            "lymphocytes": 2667,
            "hemoglobin": 14.7,
            "platelets": 258,
            "glucose": 69,
            "potassium": 3.9,
            "albumin": 4.9,
            "alt": 13,
            "creatinine": 1.37,
            "crp": 5.132,
            "fibrinogen": 2780.38,
            "il6": 5.94,
            "il10": 7.07,
            "tnfa": 68.71
          },
          "flags": {}
        },
        {
          "day": 1,
          "timepoint": "R+1",
          "phase": "recovery",
          "values": {
            "wbc": 5,
            "neutrophils": 2685,
            "lymphocytes": 1640,
            "hemoglobin": 14.7,
            "platelets": 227,
            "glucose": 90,
            "potassium": 4.4,
            "albumin": 4.9,
            "alt": 9,
            "creatinine": 1.12,
            "crp": 10.638,
            "fibrinogen": 2604.7,
            "il6": 6.86,
            "il10": 11.25,
            "tnfa": 75.84
          },
          "flags": {}
        },
        {
          "day": 45,
          "timepoint": "R+45",
          "phase": "recovery",
          "values": {
            "wbc": 4.9,
            "neutrophils": 2200,
            "lymphocytes": 2146,
            "hemoglobin": 14.3,
            "platelets": 228,
            "glucose": 84,
            "potassium": 4,
            "albumin": 4.9,
            "alt": 11,
            "creatinine": 1.11,
            "crp": 6.714,
            "fibrinogen": 2732.11,
            "il6": 1.65,
            "il10": 4.2,
            "tnfa": 44.36
          },
          "flags": {}
        },
        {
          "day": 82,
          "timepoint": "R+82",
          "phase": "follow-up",
          "values": {
            "wbc": 4.9,
            "neutrophils": 1994,
            "lymphocytes": 2171,
            "hemoglobin": 15.7,
            "platelets": 257,
            "glucose": 91,
            "potassium": 4.3,
            "albumin": 5.1,
            "alt": 15,
            "creatinine": 1.25,
            "crp": 25.03,
            "fibrinogen": 2513.02,
            "il6": 1.04,
            "il10": 8.91,
            "tnfa": 609.32
          },
          "flags": {}
        },
        {
          "day": 194,
          "timepoint": "R+194",
          "phase": "follow-up",
          "values": {
            "wbc": 4.9,
            "neutrophils": 2391,
            "lymphocytes": 1847,
            "hemoglobin": 14.1,
            "platelets": 214,
            "glucose": 87,
            "potassium": 4.3,
            "albumin": 4.6,
            "alt": 15,
            "creatinine": 1.29,
            "crp": 15.415,
            "fibrinogen": 4587.13,
            "il6": 4.26,
            "il10": 7.41,
            "tnfa": 69.07
          },
          "flags": {}
        }
      ]
    },
    "C002": {
      "id": "C002",
      "sex": "M",
      "baseline": {
        "crp": 8.927,
        "fibrinogen": 4027.43,
        "il6": 4.49,
        "il10": 11.33,
        "tnfa": 109.24
      },
      "entries": [
        {
          "day": -92,
          "timepoint": "L-92",
          "phase": "preflight",
          "values": {
            "wbc": 6.5,
            "neutrophils": 3705,
            "lymphocytes": 2119,
            "hemoglobin": 13.2,
            "platelets": 241,
            "glucose": 69,
            "potassium": 3.9,
            "albumin": 4.9,
            "alt": 16,
            "creatinine": 0.83,
            "crp": 8.927,
            "fibrinogen": 3657,
            "il6": 4.49,
            "il10": 12.04,
            "tnfa": 109.24
          },
          "flags": {}
        },
        {
          "day": -44,
          "timepoint": "L-44",
          "phase": "preflight",
          "values": {
            "wbc": 5.4,
            "neutrophils": 2873,
            "lymphocytes": 1982,
            "hemoglobin": 12.8,
            "platelets": 229,
            "glucose": 72,
            "potassium": 4,
            "albumin": 4.6,
            "alt": 24,
            "creatinine": 0.88,
            "crp": 1.569,
            "fibrinogen": 4027.43,
            "il6": 4.19,
            "il10": 5.51,
            "tnfa": 95.43
          },
          "flags": {}
        },
        {
          "day": -3,
          "timepoint": "L-3",
          "phase": "preflight",
          "values": {
            "wbc": 7.2,
            "neutrophils": 3701,
            "lymphocytes": 2873,
            "hemoglobin": 11.5,
            "platelets": 241,
            "glucose": 78,
            "potassium": 3.8,
            "albumin": 4.3,
            "alt": 19,
            "creatinine": 0.96,
            "crp": 11.967,
            "fibrinogen": 6533.18,
            "il6": 4.53,
            "il10": 11.33,
            "tnfa": 116.61
          },
          "flags": {}
        },
        {
          "day": 1,
          "timepoint": "R+1",
          "phase": "recovery",
          "values": {
            "wbc": 5.5,
            "neutrophils": 3328,
            "lymphocytes": 1540,
            "hemoglobin": 12.1,
            "platelets": 252,
            "glucose": 83,
            "potassium": 3.5,
            "albumin": 4.4,
            "alt": 16,
            "creatinine": 0.95,
            "crp": 9.311,
            "fibrinogen": 1999.88,
            "il6": 5.76,
            "il10": 12.86,
            "tnfa": 116.08
          },
          "flags": {}
        },
        {
          "day": 45,
          "timepoint": "R+45",
          "phase": "recovery",
          "values": {
            "wbc": 6.4,
            "neutrophils": 2765,
            "lymphocytes": 2874,
            "hemoglobin": 12.2,
            "platelets": 252,
            "potassium": 4.1,
            "albumin": 4.2,
            "alt": 14,
            "creatinine": 1.02,
            "crp": 3.677,
            "fibrinogen": 4074.55,
            "il6": 12.07,
            "il10": 11.21,
            "tnfa": 119.25
          },
          "flags": {
            "glucose": {
              "raw": 44,
              "reason": "outside the plausible range for an ambulatory adult (50–500)"
            }
          }
        },
        {
          "day": 82,
          "timepoint": "R+82",
          "phase": "follow-up",
          "values": {
            "wbc": 5.3,
            "neutrophils": 3132,
            "lymphocytes": 1701,
            "hemoglobin": 11.5,
            "platelets": 245,
            "glucose": 77,
            "potassium": 3.7,
            "albumin": 4.5,
            "alt": 17,
            "creatinine": 0.82,
            "crp": 8.634,
            "fibrinogen": 3279.23,
            "il6": 5.11,
            "il10": 13.5,
            "tnfa": 101.26
          },
          "flags": {}
        },
        {
          "day": 194,
          "timepoint": "R+194",
          "phase": "follow-up",
          "values": {
            "wbc": 6.4,
            "neutrophils": 3123,
            "lymphocytes": 2573,
            "hemoglobin": 12.7,
            "platelets": 243,
            "glucose": 84,
            "potassium": 4.4,
            "albumin": 4.3,
            "alt": 17,
            "creatinine": 1.02,
            "crp": 21.462,
            "fibrinogen": 2852.5,
            "il6": 0.75,
            "il10": 8.18,
            "tnfa": 197.9
          },
          "flags": {}
        }
      ]
    },
    "C003": {
      "id": "C003",
      "sex": "M",
      "baseline": {
        "crp": 42.838,
        "fibrinogen": 4153.93,
        "il6": 2.67,
        "il10": 11.25,
        "tnfa": 557.31
      },
      "entries": [
        {
          "day": -92,
          "timepoint": "L-92",
          "phase": "preflight",
          "values": {
            "wbc": 9.6,
            "hemoglobin": 13.2,
            "glucose": 77,
            "potassium": 3.7,
            "albumin": 4.4,
            "alt": 12,
            "creatinine": 1,
            "crp": 75.749,
            "fibrinogen": 4153.93,
            "il6": 2.67,
            "il10": 11.25,
            "tnfa": 687.17
          },
          "flags": {
            "neutrophils": {
              "raw": 10.1,
              "reason": "outside the plausible range for an ambulatory adult (200–30000)"
            },
            "lymphocytes": {
              "raw": 6826,
              "reason": "inconsistent with the reported lymphocytes (20.8% of 9.6 K/µL ≈ 1997)"
            },
            "platelets": {
              "raw": 12.9,
              "reason": "outside the plausible range for an ambulatory adult (30–1200)"
            }
          }
        },
        {
          "day": -44,
          "timepoint": "L-44",
          "phase": "preflight",
          "values": {
            "wbc": 9.3,
            "neutrophils": 6408,
            "lymphocytes": 2083,
            "hemoglobin": 14.4,
            "platelets": 345,
            "glucose": 62,
            "potassium": 3.5,
            "albumin": 4.9,
            "alt": 13,
            "creatinine": 1.03,
            "crp": 9.383,
            "fibrinogen": 3723.84,
            "il6": 2.69,
            "il10": 12.29,
            "tnfa": 103.95
          },
          "flags": {}
        },
        {
          "day": -3,
          "timepoint": "L-3",
          "phase": "preflight",
          "values": {
            "wbc": 9.8,
            "neutrophils": 5792,
            "lymphocytes": 3156,
            "hemoglobin": 13.3,
            "platelets": 367,
            "glucose": 75,
            "potassium": 3.3,
            "albumin": 4.2,
            "alt": 13,
            "creatinine": 1.08,
            "crp": 42.838,
            "fibrinogen": 4609.49,
            "il6": 2.51,
            "il10": 10.61,
            "tnfa": 557.31
          },
          "flags": {}
        },
        {
          "day": 1,
          "timepoint": "R+1",
          "phase": "recovery",
          "values": {
            "wbc": 7,
            "neutrophils": 4088,
            "lymphocytes": 2086,
            "hemoglobin": 13.5,
            "platelets": 359,
            "glucose": 103,
            "potassium": 3,
            "albumin": 4.2,
            "alt": 19,
            "creatinine": 0.89,
            "crp": 83.617,
            "fibrinogen": 4531.17,
            "il6": 7.6,
            "il10": 15.33,
            "tnfa": 724.24
          },
          "flags": {}
        },
        {
          "day": 45,
          "timepoint": "R+45",
          "phase": "recovery",
          "values": {
            "wbc": 7.8,
            "neutrophils": 4618,
            "lymphocytes": 2379,
            "hemoglobin": 14.6,
            "platelets": 396,
            "potassium": 4.4,
            "albumin": 4.5,
            "alt": 17,
            "creatinine": 0.94,
            "crp": 39.19,
            "fibrinogen": 4491.95,
            "il6": 1.32,
            "il10": 10.31,
            "tnfa": 216.65
          },
          "flags": {
            "glucose": {
              "raw": 36,
              "reason": "outside the plausible range for an ambulatory adult (50–500)"
            }
          }
        },
        {
          "day": 82,
          "timepoint": "R+82",
          "phase": "follow-up",
          "values": {
            "wbc": 8.8,
            "neutrophils": 4576,
            "lymphocytes": 3247,
            "hemoglobin": 14.4,
            "platelets": 345,
            "glucose": 80,
            "potassium": 3.7,
            "albumin": 4.8,
            "alt": 12,
            "creatinine": 0.89,
            "crp": 12.68,
            "fibrinogen": 4447.08,
            "il6": 3.64,
            "il10": 8.83,
            "tnfa": 72.43
          },
          "flags": {}
        },
        {
          "day": 194,
          "timepoint": "R+194",
          "phase": "follow-up",
          "values": {
            "wbc": 7.4,
            "neutrophils": 4151,
            "lymphocytes": 2220,
            "hemoglobin": 13.3,
            "platelets": 185,
            "glucose": 73,
            "potassium": 3.8,
            "albumin": 4.4,
            "alt": 10,
            "creatinine": 1.1,
            "crp": 9.379,
            "fibrinogen": 4334.63,
            "il6": 5.78,
            "il10": 12.45,
            "tnfa": 111.45
          },
          "flags": {}
        }
      ]
    },
    "C004": {
      "id": "C004",
      "sex": "M",
      "baseline": {
        "crp": 13.742,
        "fibrinogen": 3602.38,
        "il6": 3.97,
        "il10": 12.27,
        "tnfa": 98.19
      },
      "entries": [
        {
          "day": -92,
          "timepoint": "L-92",
          "phase": "preflight",
          "values": {
            "wbc": 7.7,
            "neutrophils": 4766,
            "lymphocytes": 1786,
            "hemoglobin": 17,
            "platelets": 239,
            "glucose": 100,
            "potassium": 4.2,
            "albumin": 4.6,
            "alt": 37,
            "creatinine": 1.14,
            "crp": 21.378,
            "fibrinogen": 3226.41,
            "il6": 4.9,
            "il10": 15.48,
            "tnfa": 98.19
          },
          "flags": {}
        },
        {
          "day": -44,
          "timepoint": "L-44",
          "phase": "preflight",
          "values": {
            "wbc": 6.4,
            "neutrophils": 3699,
            "lymphocytes": 1613,
            "hemoglobin": 16.6,
            "platelets": 227,
            "glucose": 83,
            "potassium": 4.2,
            "albumin": 4.4,
            "alt": 35,
            "creatinine": 1.08,
            "crp": 1.29,
            "fibrinogen": 3602.38,
            "il6": 3.09,
            "il10": 4.36,
            "tnfa": 76.76
          },
          "flags": {}
        },
        {
          "day": -3,
          "timepoint": "L-3",
          "phase": "preflight",
          "values": {
            "wbc": 10.6,
            "neutrophils": 6318,
            "lymphocytes": 2947,
            "hemoglobin": 16.8,
            "platelets": 295,
            "glucose": 56,
            "potassium": 3.7,
            "albumin": 4.6,
            "alt": 37,
            "creatinine": 1.13,
            "crp": 13.742,
            "fibrinogen": 5428.66,
            "il6": 3.97,
            "il10": 12.27,
            "tnfa": 116.45
          },
          "flags": {}
        },
        {
          "day": 1,
          "timepoint": "R+1",
          "phase": "recovery",
          "values": {
            "wbc": 8.1,
            "neutrophils": 4528,
            "lymphocytes": 2155,
            "hemoglobin": 16.5,
            "platelets": 240,
            "glucose": 97,
            "potassium": 4,
            "albumin": 4.5,
            "alt": 40,
            "creatinine": 1.15,
            "crp": 17.701,
            "fibrinogen": 4187.89,
            "il6": 6.34,
            "il10": 16.37,
            "tnfa": 111.76
          },
          "flags": {}
        },
        {
          "day": 45,
          "timepoint": "R+45",
          "phase": "recovery",
          "values": {
            "wbc": 6.8,
            "neutrophils": 3618,
            "lymphocytes": 1938,
            "hemoglobin": 16.8,
            "platelets": 281,
            "potassium": 5.9,
            "albumin": 4.5,
            "alt": 32,
            "creatinine": 1.08,
            "crp": 22.407,
            "fibrinogen": 2840.5,
            "il6": 3.59,
            "il10": 12.75,
            "tnfa": 114.74
          },
          "flags": {
            "glucose": {
              "raw": 43,
              "reason": "outside the plausible range for an ambulatory adult (50–500)"
            }
          }
        },
        {
          "day": 82,
          "timepoint": "R+82",
          "phase": "follow-up",
          "values": {
            "wbc": 7.9,
            "neutrophils": 4361,
            "lymphocytes": 2307,
            "hemoglobin": 16.4,
            "platelets": 198,
            "glucose": 80,
            "potassium": 4.2,
            "albumin": 4.6,
            "alt": 23,
            "creatinine": 1.11,
            "crp": 7.902,
            "fibrinogen": 3553.01,
            "il6": 6.02,
            "il10": 9.86,
            "tnfa": 102.71
          },
          "flags": {}
        },
        {
          "day": 194,
          "timepoint": "R+194",
          "phase": "follow-up",
          "values": {
            "wbc": 8.3,
            "neutrophils": 4200,
            "lymphocytes": 2639,
            "hemoglobin": 16.5,
            "platelets": 256,
            "glucose": 84,
            "potassium": 3.8,
            "albumin": 4.3,
            "alt": 43,
            "creatinine": 1.31,
            "crp": 46.006,
            "fibrinogen": 4390.9,
            "il6": 4.11,
            "il10": 21.74,
            "tnfa": 89.16
          },
          "flags": {}
        }
      ]
    }
  }
};
