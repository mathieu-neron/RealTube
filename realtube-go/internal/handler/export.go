package handler

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/gofiber/fiber/v3"

	"github.com/mathieu-neron/RealTube/realtube-go/internal/middleware"
)

// safeExportFilename matches only expected export filenames (no path components).
var safeExportFilename = regexp.MustCompile(`^[a-zA-Z0-9_.-]+\.sql\.gz$`)

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
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "INTERNAL_ERROR", "Failed to read export directory")
	}

	// Resolve the export directory to an absolute path for comparison
	absExportDir, err := filepath.Abs(h.exportDir)
	if err != nil {
		return middleware.ErrorResponse(c, fiber.StatusInternalServerError, "INTERNAL_ERROR", "Failed to resolve export directory")
	}

	// Find the latest .sql.gz file with safe filename validation
	var files []string
	for _, e := range entries {
		name := e.Name()
		if !e.IsDir() && strings.HasSuffix(name, ".sql.gz") && safeExportFilename.MatchString(name) {
			files = append(files, name)
		}
	}

	if len(files) == 0 {
		return middleware.ErrorResponse(c, fiber.StatusNotFound, "NOT_FOUND", "No export file available yet")
	}

	// Sort lexicographically — filenames contain YYYYMMDD so latest is last
	sort.Strings(files)
	latest := files[len(files)-1]
	resolvedPath, err := filepath.EvalSymlinks(filepath.Join(h.exportDir, latest))
	if err != nil {
		return middleware.ErrorResponse(c, fiber.StatusNotFound, "NOT_FOUND", "Export file not accessible")
	}

	// Ensure resolved path stays within the export directory
	if !strings.HasPrefix(resolvedPath, absExportDir+string(filepath.Separator)) && resolvedPath != absExportDir {
		return middleware.ErrorResponse(c, fiber.StatusForbidden, "FORBIDDEN", "Access denied")
	}

	c.Set("Content-Type", "application/gzip")
	c.Set("Content-Disposition", "attachment; filename="+latest)
	return c.SendFile(resolvedPath)
}
