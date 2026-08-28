package inventory

import "fmt"

// ContainerLabelData holds fields rendered on a container label.
type ContainerLabelData struct {
	ContainerNo  string
	ItemCode     string
	ItemName     string
	NetWeightKg  float64
	LocationName string
	LotNo        string
	ExpiryDate   string
}

// RenderContainerLabelZPL returns ZPL text for a container label (PDF remains primary for printing).
func RenderContainerLabelZPL(data ContainerLabelData) string {
	expiry := data.ExpiryDate
	if expiry == "" {
		expiry = "-"
	}
	lotNo := data.LotNo
	if lotNo == "" {
		lotNo = data.ContainerNo
	}
	return fmt.Sprintf(`^XA
^FO50,50^A0N,40,40^FD%s^FS
^FO50,100^A0N,28,28^FD%s — %s^FS
^FO50,140^A0N,28,28^FDNet: %.3f kg^FS
^FO50,180^A0N,24,24^FDLoc: %s^FS
^FO50,220^A0N,24,24^FDLot: %s^FS
^FO50,260^A0N,24,24^FDExp: %s^FS
^FO50,320^BCN,100,Y,N,N^FD%s^FS
^XZ`, data.ContainerNo, data.ItemCode, data.ItemName, data.NetWeightKg, data.LocationName, lotNo, expiry, data.ContainerNo)
}
