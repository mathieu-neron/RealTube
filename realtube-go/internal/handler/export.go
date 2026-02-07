package handler

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/gofiber/fiber/v3"
)

type ExportHandler struct {
	exportDir string
}

func NewExportHandler(exportDir string) *ExportHandler {
	return &ExportHandler{exportDir: exportDir}
}

// Export handles GET /api/database/export
// Serves the latest .sql.gz export file from the exports directory.
func (h *ExportHandler) Export(c fiber.Ctx) error {
	entries, err := os.ReadDir(h.exportDir)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "INTERNAL_ERROR",
				"message": "Failed to read export directory",
			},
		})
	}

	// Find the latest .sql.gz file
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql.gz") {
			files = append(files, e.Name())
		}
	}

	if len(files) == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": fiber.Map{
				"code":    "NOT_FOUND",
				"message": "No export file available yet",
			},
		})
	}

	// Sort lexicographically — filenames contain YYYYMMDD so latest is last
	sort.Strings(files)
	latest := files[len(files)-1]
	path := filepath.Join(h.exportDir, latest)

	c.Set("Content-Type", "application/gzip")
	c.Set("Content-Disposition", "attachment; filename="+latest)
	return c.SendFile(path)
}
