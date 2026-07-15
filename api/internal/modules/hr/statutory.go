package hr

import (
	"context"
	"encoding/json"
	"math"
	"time"

	"github.com/jackc/pgx/v5"
)

type statutoryConfigSSS struct {
	EmployeeRate     float64 `json:"employee_rate"`
	EmployerRate     float64 `json:"employer_rate"`
	MSCMin           float64 `json:"msc_min"`
	MSCMax           float64 `json:"msc_max"`
	RegularMSCCap    float64 `json:"regular_msc_cap"`
	ECLow            float64 `json:"ec_low"`
	ECHigh           float64 `json:"ec_high"`
	ECCompThreshold  float64 `json:"ec_comp_threshold"`
	BandStart        float64 `json:"band_start"`
	BandWidth        float64 `json:"band_width"`
}

type statutoryConfigPHIC struct {
	Rate           float64 `json:"rate"`
	EmployeeShare  float64 `json:"employee_share"`
	EmployerShare  float64 `json:"employer_share"`
	SalaryFloor    float64 `json:"salary_floor"`
	SalaryCeiling  float64 `json:"salary_ceiling"`
}

type statutoryConfigHDMF struct {
	LowThreshold    float64 `json:"low_threshold"`
	Ceiling         float64 `json:"ceiling"`
	EmployeeRateLow float64 `json:"employee_rate_low"`
	EmployeeRate    float64 `json:"employee_rate"`
	EmployerRate    float64 `json:"employer_rate"`
	MaxEE           float64 `json:"max_ee"`
	MaxER           float64 `json:"max_er"`
}

type birBracket struct {
	Limit *float64 `json:"limit"`
	Base  float64  `json:"base"`
	Rate  float64  `json:"rate"`
}

type statutoryConfigBIR struct {
	Method   string       `json:"method"`
	Brackets []birBracket `json:"brackets"`
}

type statutoryResult struct {
	Lines          []draftPayslipLine
	EmployeeDeduct float64
	EmployerShare  float64
}

type draftPayslipLine struct {
	LineNo      int
	LineType    string
	LineCode    string
	Description string
	Amount      float64
}

func loadAgencyConfig(ctx context.Context, q pgx.Tx, agency string, asOf time.Time) (json.RawMessage, string, error) {
	var cfg []byte
	var code string
	err := q.QueryRow(ctx, `
		select package_code, config
		from public.hr_statutory_packages
		where agency = $1 and is_active
		  and effective_from <= $2::date
		  and (effective_to is null or effective_to >= $2::date)
		order by effective_from desc
		limit 1`, agency, asOf.Format("2006-01-02")).Scan(&code, &cfg)
	return cfg, code, err
}

func mscFromCompensation(comp float64, cfg statutoryConfigSSS) float64 {
	if comp < cfg.BandStart {
		return cfg.MSCMin
	}
	topBandStart := cfg.MSCMax - 250 // 34750 for 35000 MSC
	if cfg.BandWidth <= 0 {
		cfg.BandWidth = 500
	}
	if comp >= topBandStart {
		return cfg.MSCMax
	}
	band := math.Floor((comp - cfg.BandStart) / cfg.BandWidth)
	return cfg.BandStart + band*cfg.BandWidth + cfg.BandWidth/2
}

func computeSSS(comp float64, cfg statutoryConfigSSS) (ee, erRegularMPF, erEC float64, desc string) {
	msc := mscFromCompensation(comp, cfg)
	regular := math.Min(msc, cfg.RegularMSCCap)
	mpf := math.Max(0, msc-cfg.RegularMSCCap)
	ee = roundMoney(regular*cfg.EmployeeRate + mpf*cfg.EmployeeRate)
	erRegularMPF = roundMoney(regular*cfg.EmployerRate + mpf*cfg.EmployerRate)
	if comp < cfg.ECCompThreshold {
		erEC = cfg.ECLow
	} else {
		erEC = cfg.ECHigh
	}
	desc = "SSS employee share"
	return
}

func computePhilHealth(basic float64, cfg statutoryConfigPHIC) (ee, er float64) {
	base := basic
	if base < cfg.SalaryFloor {
		base = cfg.SalaryFloor
	}
	if base > cfg.SalaryCeiling {
		base = cfg.SalaryCeiling
	}
	total := roundMoney(base * cfg.Rate)
	ee = roundMoney(total * cfg.EmployeeShare)
	er = roundMoney(total * cfg.EmployerShare)
	return
}

func computePagibig(comp float64, cfg statutoryConfigHDMF) (ee, er float64) {
	if comp <= cfg.LowThreshold {
		ee = roundMoney(comp * cfg.EmployeeRateLow)
		er = roundMoney(comp * cfg.EmployerRate)
		return
	}
	base := comp
	if base > cfg.Ceiling {
		base = cfg.Ceiling
	}
	ee = roundMoney(base * cfg.EmployeeRate)
	er = roundMoney(base * cfg.EmployerRate)
	if ee > cfg.MaxEE {
		ee = cfg.MaxEE
	}
	if er > cfg.MaxER {
		er = cfg.MaxER
	}
	return
}

func computeBIRWithholding(monthlyTaxable float64, cfg statutoryConfigBIR) float64 {
	if monthlyTaxable <= 0 {
		return 0
	}
	annual := monthlyTaxable * 12
	if len(cfg.Brackets) == 0 {
		return roundMoney(computeBIRAnnualTRAIN(annual) / 12)
	}
	prevLimit := 0.0
	for i, b := range cfg.Brackets {
		isLast := i == len(cfg.Brackets)-1 || b.Limit == nil
		limit := math.Inf(1)
		if b.Limit != nil {
			limit = *b.Limit
		}
		if annual <= limit || isLast {
			excessOver := math.Max(0, annual-prevLimit)
			var tax float64
			if b.Base > 0 {
				tax = b.Base + excessOver*b.Rate
			} else {
				tax = excessOver * b.Rate
			}
			return roundMoney(tax / 12)
		}
		prevLimit = limit
	}
	return 0
}

// computeBIRAnnualTRAIN is the fallback TRAIN schedule when config brackets are empty.
func computeBIRAnnualTRAIN(annual float64) float64 {
	switch {
	case annual <= 250000:
		return 0
	case annual <= 400000:
		return (annual - 250000) * 0.15
	case annual <= 800000:
		return 22500 + (annual-400000)*0.20
	case annual <= 2000000:
		return 102500 + (annual-800000)*0.25
	case annual <= 8000000:
		return 402500 + (annual-2000000)*0.30
	default:
		return 2202500 + (annual-8000000)*0.35
	}
}

func computeStatutoryDeductions(ctx context.Context, tx pgx.Tx, asOf time.Time, monthlyBasic float64) (statutoryResult, error) {
	out := statutoryResult{}
	lineNo := 1
	out.Lines = append(out.Lines, draftPayslipLine{
		LineNo: lineNo, LineType: "earning", LineCode: "BASIC", Description: "Base salary", Amount: roundMoney(monthlyBasic),
	})
	lineNo++

	// SSS
	if raw, code, err := loadAgencyConfig(ctx, tx, "sss", asOf); err == nil {
		var cfg statutoryConfigSSS
		_ = json.Unmarshal(raw, &cfg)
		ee, erMain, erEC, _ := computeSSS(monthlyBasic, cfg)
		out.Lines = append(out.Lines, draftPayslipLine{
			LineNo: lineNo, LineType: "deduction", LineCode: "SSS_EE", Description: "SSS EE (" + code + ")", Amount: ee,
		})
		lineNo++
		out.Lines = append(out.Lines, draftPayslipLine{
			LineNo: lineNo, LineType: "employer_share", LineCode: "SSS_ER", Description: "SSS ER + MPF", Amount: erMain,
		})
		lineNo++
		out.Lines = append(out.Lines, draftPayslipLine{
			LineNo: lineNo, LineType: "employer_share", LineCode: "SSS_EC", Description: "SSS EC (employer)", Amount: erEC,
		})
		lineNo++
		out.EmployeeDeduct += ee
		out.EmployerShare += erMain + erEC
	}

	// PhilHealth
	if raw, code, err := loadAgencyConfig(ctx, tx, "philhealth", asOf); err == nil {
		var cfg statutoryConfigPHIC
		_ = json.Unmarshal(raw, &cfg)
		ee, er := computePhilHealth(monthlyBasic, cfg)
		out.Lines = append(out.Lines, draftPayslipLine{
			LineNo: lineNo, LineType: "deduction", LineCode: "PHIC_EE", Description: "PhilHealth EE (" + code + ")", Amount: ee,
		})
		lineNo++
		out.Lines = append(out.Lines, draftPayslipLine{
			LineNo: lineNo, LineType: "employer_share", LineCode: "PHIC_ER", Description: "PhilHealth ER", Amount: er,
		})
		lineNo++
		out.EmployeeDeduct += ee
		out.EmployerShare += er
	}

	// Pag-IBIG
	if raw, code, err := loadAgencyConfig(ctx, tx, "pagibig", asOf); err == nil {
		var cfg statutoryConfigHDMF
		_ = json.Unmarshal(raw, &cfg)
		ee, er := computePagibig(monthlyBasic, cfg)
		out.Lines = append(out.Lines, draftPayslipLine{
			LineNo: lineNo, LineType: "deduction", LineCode: "HDMF_EE", Description: "Pag-IBIG EE (" + code + ")", Amount: ee,
		})
		lineNo++
		out.Lines = append(out.Lines, draftPayslipLine{
			LineNo: lineNo, LineType: "employer_share", LineCode: "HDMF_ER", Description: "Pag-IBIG ER", Amount: er,
		})
		lineNo++
		out.EmployeeDeduct += ee
		out.EmployerShare += er
	}

	// BIR — taxable ≈ basic − EE statutory (common approximate for annualized monthly)
	taxable := monthlyBasic
	for _, ln := range out.Lines {
		if ln.LineType == "deduction" && (ln.LineCode == "SSS_EE" || ln.LineCode == "PHIC_EE" || ln.LineCode == "HDMF_EE") {
			taxable -= ln.Amount
		}
	}
	if taxable < 0 {
		taxable = 0
	}
	if raw, code, err := loadAgencyConfig(ctx, tx, "bir", asOf); err == nil {
		var cfg statutoryConfigBIR
		_ = json.Unmarshal(raw, &cfg)
		wht := computeBIRWithholding(taxable, cfg)
		out.Lines = append(out.Lines, draftPayslipLine{
			LineNo: lineNo, LineType: "deduction", LineCode: "WHT", Description: "Withholding tax (" + code + ")", Amount: wht,
		})
		out.EmployeeDeduct += wht
	}

	out.EmployeeDeduct = roundMoney(out.EmployeeDeduct)
	out.EmployerShare = roundMoney(out.EmployerShare)
	return out, nil
}
