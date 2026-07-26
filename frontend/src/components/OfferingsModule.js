import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Search, Plus, Star, Package, Sparkles, 
  ChevronDown, ChevronRight, Edit, Trash2,
  Image as ImageIcon, Heart, Home, Save, X, GripVertical,
  Upload, FileText, Loader2, RefreshCw, Download, CheckCircle2, AlertTriangle
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'sonner';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function OfferingsModule({ salonId, token }) {
  const [activeTab, setActiveTab] = useState('services');
  const [services, setServices] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [packages, setPackages] = useState([]);
  const [categorizedServices, setCategorizedServices] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  
  // Modal states
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [editingPackage, setEditingPackage] = useState(null);

  // Menu Parsing modal state
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [menuFile, setMenuFile] = useState(null);
  const [menuParsing, setMenuParsing] = useState(false);
  const [menuApplying, setMenuApplying] = useState(false);
  const [parsedServices, setParsedServices] = useState([]);
  const [parsedPackages, setParsedPackages] = useState([]);
  const [showApplyChoice, setShowApplyChoice] = useState(false);

  // CSV bulk-upload modal state (always ADDS services — never replaces)
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState(null);

  // Bulk-delete selection state (Jul 2026)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleParseMenu = async () => {
    if (!menuFile) {
      toast.error('Please select a menu file (PDF or image)');
      return;
    }
    setMenuParsing(true);
    setParsedServices([]);
    setParsedPackages([]);
    setShowApplyChoice(false);
    try {
      const fd = new FormData();
      fd.append('file', menuFile);
      const response = await axios.post(
        `${API}/salons/${salonId}/services/parse-menu`,
        fd,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      setParsedServices(response.data.services || []);
      setParsedPackages(response.data.packages || []);
      setShowApplyChoice(true);
      toast.success(response.data.message || 'Menu parsed successfully');
    } catch (error) {
      console.error('Parse menu error:', error);
      toast.error(error.response?.data?.detail || 'Failed to parse menu');
    } finally {
      setMenuParsing(false);
    }
  };

  const handleApplyParsed = async (mode) => {
    if (parsedServices.length === 0 && parsedPackages.length === 0) {
      toast.error('No services to apply');
      return;
    }
    if (mode === 'replace' && !window.confirm(
      'This will REPLACE all your existing services and packages with the parsed ones. Continue?'
    )) return;
    setMenuApplying(true);
    try {
      const response = await axios.post(
        `${API}/salons/${salonId}/services/apply-parsed`,
        { services: parsedServices, packages: parsedPackages, mode },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(response.data.message || 'Services applied');
      setShowMenuModal(false);
      setMenuFile(null);
      setParsedServices([]);
      setParsedPackages([]);
      setShowApplyChoice(false);
      fetchAllData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to apply services');
    } finally {
      setMenuApplying(false);
    }
  };

  // ---- CSV bulk upload (additive — never replaces existing services) ----
  const handleDownloadCsvTemplate = async () => {
    try {
      const res = await axios.get(
        `${API}/salons/${salonId}/services/csv-template`,
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'services_template.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Failed to download template');
    }
  };

  const handleUploadCsv = async () => {
    if (!csvFile) {
      toast.error('Please choose a CSV file');
      return;
    }
    setCsvUploading(true);
    setCsvResult(null);
    try {
      const fd = new FormData();
      fd.append('file', csvFile);
      const res = await axios.post(
        `${API}/salons/${salonId}/services/upload-csv`,
        fd,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
      );
      setCsvResult(res.data);
      if (res.data?.created > 0) {
        toast.success(res.data.message || `Added ${res.data.created} services`);
      } else {
        toast.info(res.data?.message || 'No new services were added');
      }
      // Refresh the services list so newly added rows appear immediately.
      fetchAllData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to upload CSV');
    } finally {
      setCsvUploading(false);
    }
  };

  useEffect(() => {
    if (salonId) fetchAllData();
  }, [salonId]);

  // Bulk-delete: toggle selection and issue POST /salons/{id}/services/bulk-delete
  const toggleServiceSelected = (sid) => {
    setSelectedServiceIds((prev) => (prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]));
  };
  const clearSelection = () => {
    setSelectionMode(false);
    setSelectedServiceIds([]);
  };
  const bulkDeleteSelected = async () => {
    if (selectedServiceIds.length === 0) { toast.error('Select at least one service to delete'); return; }
    if (!window.confirm(`Delete ${selectedServiceIds.length} selected service(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const res = await axios.post(
        `${API}/salons/${salonId}/services/bulk-delete`,
        { service_ids: selectedServiceIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const removed = (res.data?.hard_deleted || 0) + (res.data?.disabled_for_salon || 0);
      toast.success(`Removed ${removed} service(s)`);
      clearSelection();
      fetchAllData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [servicesRes, favoritesRes, packagesRes] = await Promise.all([
        axios.get(`${API}/salons/${salonId}/services/all`),
        axios.get(`${API}/services/favorites`),
        axios.get(`${API}/salons/${salonId}/packages`)
      ]);

      setServices(servicesRes.data);
      setFavorites(favoritesRes.data);
      setPackages(packagesRes.data);

      // Categorize services
      const categorized = {};
      servicesRes.data.forEach(service => {
        const category = service.category || 'General';
        if (!categorized[category]) {
          categorized[category] = [];
        }
        categorized[category].push(service);
      });
      setCategorizedServices(categorized);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load offerings');
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const toggleFavorite = async (serviceId, currentStatus) => {
    try {
      await axios.put(
        `${API}/services/${serviceId}/favorite?is_favorite=${!currentStatus}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(currentStatus ? 'Removed from favorites' : 'Added to favorites');
      fetchAllData();
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast.error('Failed to update favorite');
    }
  };

  const toggleServiceEnabled = async (serviceId, currentStatus) => {
    try {
      await axios.put(
        `${API}/salons/${salonId}/services/${serviceId}/toggle?is_enabled=${!currentStatus}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(currentStatus ? 'Service disabled for your salon' : 'Service enabled for your salon');
      fetchAllData();
    } catch (error) {
      console.error('Error toggling service:', error);
      toast.error('Failed to update service');
    }
  };

  const deleteService = async (serviceId) => {
    if (!window.confirm('Are you sure you want to delete this service?')) return;
    
    try {
      await axios.delete(`${API}/services/${serviceId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Service deleted successfully');
      fetchAllData();
    } catch (error) {
      console.error('Error deleting service:', error);
      toast.error('Failed to delete service');
    }
  };

  const deletePackage = async (packageId) => {
    if (!window.confirm('Are you sure you want to delete this package?')) return;
    
    try {
      await axios.delete(`${API}/salons/${salonId}/packages/${packageId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Package deleted successfully');
      fetchAllData();
    } catch (error) {
      console.error('Error deleting package:', error);
      toast.error('Failed to delete package');
    }
  };

  const handleEditService = (service) => {
    setEditingService(service);
    setShowServiceModal(true);
  };

  const handleEditPackage = (pkg) => {
    setEditingPackage(pkg);
    setShowPackageModal(true);
  };

  const onDragEnd = async (result) => {
    if (!result.destination) return;

    const items = Array.from(favorites);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setFavorites(items);

    try {
      const serviceIds = items.map(item => item.id);
      await axios.put(
        `${API}/services/favorites/reorder`,
        serviceIds,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Favorites reordered');
    } catch (error) {
      console.error('Error reordering favorites:', error);
      toast.error('Failed to reorder favorites');
      fetchAllData();
    }
  };

  const filteredServices = Object.entries(categorizedServices).reduce((acc, [category, servicesList]) => {
    const filtered = servicesList.filter(service => {
      const matchesSearch = service.service_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGender = genderFilter === 'all' || 
                           service.gender_tag === genderFilter || 
                           service.gender_tag === 'Unisex';
      return matchesSearch && matchesGender;
    });
    if (filtered.length > 0) {
      acc[category] = filtered;
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-foreground">Offerings</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => { setMenuFile(null); setParsedServices([]); setParsedPackages([]); setShowApplyChoice(false); setShowMenuModal(true); }}
            size="sm"
            className="bg-gold text-black hover:bg-gold/90 text-xs"
          >
            <Upload className="w-3 h-3 mr-1" />
            Upload Menu (PDF / Image)
          </Button>
          <Button
            onClick={() => { setCsvFile(null); setCsvResult(null); setShowCsvModal(true); }}
            variant="outline"
            size="sm"
            className="text-xs"
            data-testid="upload-services-csv-btn"
          >
            <FileText className="w-3 h-3 mr-1" />
            Upload CSV
          </Button>
          {activeTab === 'services' && (
            selectionMode ? (
              <>
                <Button
                  onClick={bulkDeleteSelected}
                  size="sm"
                  variant="destructive"
                  disabled={bulkDeleting || selectedServiceIds.length === 0}
                  className="text-xs"
                  data-testid="bulk-delete-confirm-btn"
                >
                  {bulkDeleting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trash2 className="w-3 h-3 mr-1" />}
                  Delete Selected ({selectedServiceIds.length})
                </Button>
                <Button onClick={clearSelection} size="sm" variant="outline" className="text-xs" data-testid="bulk-delete-cancel-btn">
                  <X className="w-3 h-3 mr-1" /> Cancel
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setSelectionMode(true)}
                variant="outline"
                size="sm"
                className="text-xs"
                data-testid="bulk-delete-mode-btn"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Bulk Delete
              </Button>
            )
          )}
        </div>
      </div>

      {/* Upload Menu Modal */}
      <Dialog open={showMenuModal} onOpenChange={(open) => {
        setShowMenuModal(open);
        if (!open) {
          setMenuFile(null);
          setParsedServices([]);
          setParsedPackages([]);
          setShowApplyChoice(false);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gold" />
              Upload Menu — AI Service Extraction
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-800">
              <p className="font-semibold mb-1">How it works</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Upload your salon menu as <b>PDF</b> or an <b>image</b> (PNG / JPG / WEBP).</li>
                <li>Our AI extracts every service with name, category, gender, duration and price.</li>
                <li>Review the parsed list below, then choose to <b>Add</b> (merge with existing) or <b>Replace</b> all your services.</li>
              </ul>
            </div>

            {!showApplyChoice && (
              <>
                <div>
                  <Label htmlFor="menu-file" className="text-sm font-medium">Menu file</Label>
                  <Input
                    id="menu-file"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                    onChange={(e) => setMenuFile(e.target.files?.[0] || null)}
                    className="mt-2"
                  />
                  {menuFile && (
                    <p className="text-xs text-muted-foreground mt-1">Selected: {menuFile.name} ({Math.round(menuFile.size / 1024)} KB)</p>
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleParseMenu}
                    disabled={!menuFile || menuParsing}
                    className="flex-1 bg-gold text-black hover:bg-gold/90"
                  >
                    {menuParsing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Parsing menu (this may take 30–60s)...</>
                    ) : (
                      <><Sparkles className="w-4 h-4 mr-2" /> Parse Menu with AI</>
                    )}
                  </Button>
                  <Button onClick={() => setShowMenuModal(false)} variant="outline">
                    Cancel
                  </Button>
                </div>
              </>
            )}

            {showApplyChoice && (
              <>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-muted text-sm font-semibold flex items-center justify-between">
                    <span>Parsed Services ({parsedServices.length})</span>
                    {parsedPackages.length > 0 && <span className="text-xs">+ {parsedPackages.length} packages</span>}
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-border">
                    {parsedServices.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground text-center">No services were extracted from the menu.</p>
                    ) : parsedServices.map((s, idx) => (
                      <div key={`${s.service_name}-${idx}`} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{s.service_name}</p>
                          <p className="text-muted-foreground truncate">
                            {s.category} · {s.gender} · {s.default_duration} min
                          </p>
                        </div>
                        <span className="font-bold text-gold">₹{s.base_price}</span>
                      </div>
                    ))}
                  </div>
                  {parsedPackages.length > 0 && (
                    <div className="border-t border-border">
                      <div className="px-3 py-2 bg-muted/50 text-xs font-semibold">Packages</div>
                      <div className="max-h-32 overflow-y-auto divide-y divide-border">
                        {parsedPackages.map((p, idx) => (
                          <div key={`${p.package_name}-${idx}`} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{p.package_name}</p>
                              <p className="text-muted-foreground truncate">{(p.service_names || []).join(', ')}</p>
                            </div>
                            <span className="font-bold text-gold">₹{p.package_price}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                  <Button
                    onClick={() => handleApplyParsed('add')}
                    disabled={menuApplying || parsedServices.length === 0}
                    className="bg-green-600 text-white hover:bg-green-700"
                  >
                    {menuApplying ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Adding...</>
                    ) : (
                      <><Plus className="w-4 h-4 mr-2" /> Add to existing</>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleApplyParsed('replace')}
                    disabled={menuApplying || parsedServices.length === 0}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    {menuApplying ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Replacing...</>
                    ) : (
                      <><RefreshCw className="w-4 h-4 mr-2" /> Replace all existing</>
                    )}
                  </Button>
                </div>
                <Button
                  onClick={() => { setShowApplyChoice(false); setParsedServices([]); setParsedPackages([]); setMenuFile(null); }}
                  variant="outline"
                  className="w-full"
                >
                  Re-upload a different menu
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Services CSV Modal (additive — never replaces existing) */}
      <Dialog open={showCsvModal} onOpenChange={(open) => {
        setShowCsvModal(open);
        if (!open) { setCsvFile(null); setCsvResult(null); }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-gold" />
              Upload Services CSV
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900 dark:bg-blue-900/20 dark:text-blue-200 dark:border-blue-800">
              <p className="font-semibold mb-1">How it works</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>Download the template, fill one service per row, then upload it here.</li>
                <li>All services are <b>added</b> to your salon — existing services are never replaced or removed.</li>
                <li>Only <b>service_name</b> is required. Duplicate names (already in your salon) are skipped.</li>
                <li>Columns: <code>service_name, description, category, gender_tag, default_duration, base_price, price_type, is_favorite, available_at_home, thumbnail_url, images</code>.</li>
              </ul>
            </div>

            <Button
              onClick={handleDownloadCsvTemplate}
              variant="outline"
              size="sm"
              className="text-xs"
              data-testid="download-csv-template-btn"
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Download CSV template
            </Button>

            <div>
              <Label htmlFor="services-csv-file" className="text-sm font-medium">CSV / Excel file</Label>
              <Input
                id="services-csv-file"
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                onChange={(e) => { setCsvFile(e.target.files?.[0] || null); setCsvResult(null); }}
                className="mt-2"
                data-testid="services-csv-file-input"
              />
              {csvFile && (
                <p className="text-xs text-muted-foreground mt-1">Selected: {csvFile.name} ({Math.round(csvFile.size / 1024)} KB)</p>
              )}
            </div>

            {csvResult && (
              <div className="border border-border rounded-lg overflow-hidden" data-testid="csv-upload-result">
                <div className="px-3 py-2 bg-muted text-sm font-semibold">Upload summary</div>
                <div className="p-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span><b>{csvResult.created}</b> service(s) added</span>
                  </div>
                  {csvResult.skipped_duplicates > 0 && (
                    <div className="flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="w-4 h-4" />
                      <span><b>{csvResult.skipped_duplicates}</b> duplicate(s) skipped</span>
                    </div>
                  )}
                  {Array.isArray(csvResult.errors) && csvResult.errors.length > 0 && (
                    <div className="text-xs">
                      <div className="flex items-center gap-2 text-red-600 mb-1">
                        <AlertTriangle className="w-4 h-4" />
                        <span><b>{csvResult.errors.length}</b> row(s) had errors:</span>
                      </div>
                      <div className="max-h-32 overflow-y-auto rounded bg-muted/50 p-2 space-y-0.5">
                        {csvResult.errors.map((er, i) => (
                          <div key={`${er.row}-${i}`} className="text-muted-foreground">Row {er.row}: {er.reason}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleUploadCsv}
                disabled={!csvFile || csvUploading}
                className="flex-1 bg-gold text-black hover:bg-gold/90"
                data-testid="confirm-upload-csv-btn"
              >
                {csvUploading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" /> Upload & add services</>
                )}
              </Button>
              <Button onClick={() => setShowCsvModal(false)} variant="outline">
                {csvResult ? 'Done' : 'Cancel'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="favorites" className="flex items-center gap-2">
            <Star className="w-4 h-4" />
            Favorites ({favorites.length})
          </TabsTrigger>
          <TabsTrigger value="services" className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Services ({services.length})
          </TabsTrigger>
          <TabsTrigger value="packages" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Packages ({packages.length})
          </TabsTrigger>
        </TabsList>

        {/* FAVORITES TAB */}
        <TabsContent value="favorites" className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Quick Access Favorites</h3>
              <p className="text-sm text-muted-foreground">Drag to reorder</p>
            </div>

            {favorites.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Star className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No favorites yet</p>
                <p className="text-sm">Mark services as favorites to see them here</p>
              </div>
            ) : (
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="favorites">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {favorites.map((service, index) => (
                        <Draggable key={service.id} draggableId={service.id} index={index}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className="bg-background border border-border rounded-lg p-4 hover:border-gold/50 transition-colors"
                            >
                              <div className="flex items-center gap-4">
                                <div {...provided.dragHandleProps}>
                                  <GripVertical className="w-5 h-5 text-muted-foreground cursor-move" />
                                </div>
                                <ServiceCardContent 
                                  service={service} 
                                  onToggleFavorite={toggleFavorite}
                                  onToggleEnabled={toggleServiceEnabled}
                                  onEdit={handleEditService}
                                  onDelete={deleteService}
                                  salonId={salonId}
                                />
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>
        </TabsContent>

        {/* SERVICES TAB */}
        <TabsContent value="services" className="space-y-4">
          {/* Filters and Search */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search services..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              <Button 
                onClick={() => { setEditingService(null); setShowServiceModal(true); }}
                className="bg-gold text-black hover:bg-gold/90 whitespace-nowrap"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Service
              </Button>

              <select
                value={genderFilter}
                onChange={(e) => setGenderFilter(e.target.value)}
                className="px-4 py-2 bg-background border border-border rounded-md text-foreground"
              >
                <option value="all">All Genders</option>
                <option value="Men">Men Only</option>
                <option value="Women">Women Only</option>
                <option value="Unisex">Unisex</option>
              </select>
            </div>
          </div>

          {/* Categorized Services */}
          <div className="space-y-3">
            {Object.entries(filteredServices).sort().map(([category, servicesList]) => {
              const enabledCount = servicesList.filter(s => s.is_enabled_for_salon).length;
              const allEnabled = enabledCount === servicesList.length;
              
              const handleCategorySelectAll = () => {
                const shouldEnable = !allEnabled;
                servicesList.forEach(service => {
                  if (service.is_enabled_for_salon !== shouldEnable) {
                    toggleServiceEnabled(service.id, service.is_enabled_for_salon);
                  }
                });
              };
              
              return (
                <div key={category} className="bg-card border border-border rounded-lg overflow-hidden">
                  <div className="w-full px-6 py-4 flex items-center justify-between bg-muted/50 hover:bg-muted transition-colors">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="flex items-center gap-3 flex-1"
                    >
                      <div className="flex items-center gap-3">
                        {expandedCategories[category] ? (
                          <ChevronDown className="w-5 h-5 text-gold" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        )}
                        <h3 className="text-lg font-semibold text-foreground">{category}</h3>
                        <span className="text-sm text-muted-foreground">
                          ({enabledCount}/{servicesList.length} enabled)
                        </span>
                      </div>
                    </button>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={allEnabled}
                        onCheckedChange={handleCategorySelectAll}
                        className="data-[state=checked]:bg-gold data-[state=checked]:border-gold data-[state=checked]:text-black"
                      />
                      <span className="text-xs text-muted-foreground">Select All</span>
                    </div>
                  </div>

                  {expandedCategories[category] && (
                    <div className="p-4 space-y-2">
                      {servicesList.map((service) => (
                        <div key={service.id} className={`bg-background border rounded-lg p-4 transition-colors ${selectionMode && selectedServiceIds.includes(service.id) ? 'border-rose-500 bg-rose-500/5' : 'border-border hover:border-gold/50'}`}>
                          <div className="flex items-center gap-3">
                            {selectionMode && (
                              <Checkbox
                                checked={selectedServiceIds.includes(service.id)}
                                onCheckedChange={() => toggleServiceSelected(service.id)}
                                data-testid={`bulk-delete-checkbox-${service.id}`}
                                className="data-[state=checked]:bg-rose-500 data-[state=checked]:border-rose-500"
                              />
                            )}
                            <div className="flex-1">
                              <ServiceCardContent 
                                service={service} 
                                onToggleFavorite={toggleFavorite}
                                onToggleEnabled={toggleServiceEnabled}
                                onEdit={handleEditService}
                                onDelete={deleteService}
                                salonId={salonId}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {Object.keys(filteredServices).length === 0 && (
              <div className="text-center py-12 text-muted-foreground bg-card border border-border rounded-lg">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No services found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* PACKAGES TAB */}
        <TabsContent value="packages" className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <Button onClick={() => { setEditingPackage(null); setShowPackageModal(true); }} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Create New Package
            </Button>
          </div>

          {packages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground bg-card border border-border rounded-lg">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No packages created yet</p>
              <p className="text-sm">Create combo packages to offer deals</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {packages.map((pkg) => (
                <PackageCard 
                  key={pkg.id} 
                  package={pkg}
                  services={services}
                  onEdit={handleEditPackage}
                  onDelete={deletePackage}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Service Modal */}
      {showServiceModal && (
        <ServiceModal
          service={editingService}
          open={showServiceModal}
          onClose={() => { setShowServiceModal(false); setEditingService(null); }}
          onSave={fetchAllData}
          token={token}
        />
      )}

      {/* Package Modal */}
      {showPackageModal && (
        <PackageModal
          package={editingPackage}
          services={services}
          open={showPackageModal}
          onClose={() => { setShowPackageModal(false); setEditingPackage(null); }}
          onSave={fetchAllData}
          token={token}
          salonId={salonId}
        />
      )}
    </div>
  );
}

// Service Card Content Component
function ServiceCardContent({ service, onToggleFavorite, onToggleEnabled, onEdit, onDelete, salonId }) {
  const getGenderBadge = (gender) => {
    const colors = {
      Men: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      Women: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      Unisex: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    };
    return colors[gender] || colors.Unisex;
  };

  const isEnabledForSalon = service.is_enabled_for_salon;

  return (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-4 flex-1">
        {service.images && service.images.length > 0 ? (
          <img
            src={service.images[0]}
            alt={service.service_name}
            className="w-12 h-12 rounded-lg object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-muted-foreground" />
          </div>
        )}

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h4 className="font-semibold text-foreground">{service.service_name}</h4>
            <span className={`px-2 py-0.5 text-xs border rounded ${getGenderBadge(service.gender_tag)}`}>
              {service.gender_tag}
            </span>
            {service.category && (
              <span className="px-2 py-0.5 text-xs bg-gray-500/20 text-gray-400 border border-gray-500/30 rounded">
                {service.category}
              </span>
            )}
            {service.available_at_home && (
              <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded flex items-center gap-1">
                <Home className="w-3 h-3" />
                Home
              </span>
            )}
            {!isEnabledForSalon && (
              <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded">
                Disabled for Salon
              </span>
            )}
          </div>
          {service.description && (
            <p className="text-sm text-muted-foreground">{service.description}</p>
          )}
        </div>

        <div className="text-right">
          <p className="text-lg font-bold text-gold">
            ₹{service.base_price}
            {service.price_type === 'onwards' && <span className="text-sm font-normal text-muted-foreground"> onwards</span>}
          </p>
          <p className="text-xs text-muted-foreground">{service.default_duration} min</p>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4">
        <div className="flex flex-col items-center">
          <Checkbox
            checked={isEnabledForSalon}
            onCheckedChange={() => onToggleEnabled(service.id, isEnabledForSalon)}
            className="data-[state=checked]:bg-gold data-[state=checked]:border-gold data-[state=checked]:text-black"
          />
          <span className="text-[10px] text-muted-foreground mt-1">Enable</span>
        </div>
        <button
          onClick={() => onToggleFavorite(service.id, service.is_favorite)}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
          title="Add to favorites"
        >
          {service.is_favorite ? (
            <Heart className="w-5 h-5 text-gold fill-gold" />
          ) : (
            <Heart className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
        <button 
          onClick={() => onEdit(service)}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
          title="Edit service"
        >
          <Edit className="w-5 h-5 text-muted-foreground" />
        </button>
        <button
          onClick={() => onDelete(service.id)}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
          title="Delete service"
        >
          <Trash2 className="w-5 h-5 text-red-500" />
        </button>
      </div>
    </div>
  );
}

// Package Card Component
function PackageCard({ package: pkg, services, onEdit, onDelete }) {
  const getGenderBadge = (gender) => {
    const colors = {
      Men: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      Women: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      Unisex: 'bg-purple-500/20 text-purple-400 border-purple-500/30'
    };
    return colors[gender] || colors.Unisex;
  };

  // Get service details for services in this package
  const packageServices = services.filter(s => pkg.service_ids?.includes(s.id));

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden hover:border-gold/50 transition-colors">
      {pkg.image_url && (
        <img
          src={pkg.image_url}
          alt={pkg.package_name}
          className="w-full h-48 object-cover"
        />
      )}
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-foreground mb-2">{pkg.package_name}</h3>
            <span className={`px-2 py-1 text-xs border rounded ${getGenderBadge(pkg.gender_tag)}`}>
              {pkg.gender_tag}
            </span>
          </div>
          <span className="px-3 py-1 bg-gold/20 text-gold rounded-full text-sm font-semibold">
            ₹{pkg.total_price}
          </span>
        </div>

        {pkg.description && (
          <p className="text-sm text-muted-foreground mb-4">{pkg.description}</p>
        )}

        <div className="space-y-2">
          <p className="text-sm font-semibold text-foreground">Includes ({packageServices.length} services):</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {packageServices.map((service) => (
              <div key={service.id} className="flex justify-between items-center text-sm p-2 bg-background rounded">
                <span className="text-foreground">{service.service_name}</span>
                <span className="text-gold font-semibold">₹{service.base_price}</span>
              </div>
            ))}
          </div>
          {packageServices.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No services selected</p>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-border flex gap-2">
          <Button 
            onClick={() => onEdit(pkg)}
            variant="outline" 
            size="sm" 
            className="flex-1"
          >
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Button>
          <Button 
            onClick={() => onDelete(pkg.id)}
            variant="outline" 
            size="sm" 
            className="text-red-500 border-red-500/50 hover:bg-red-500/10"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// Service Modal Component
function ServiceModal({ service, open, onClose, onSave, token }) {
  const _defaultFormData = {
    service_name: '',
    description: '',
    category: 'General',
    gender_tag: 'Unisex',
    default_duration: 30,
    base_price: 0,
    price_type: 'fixed',
    images: [],
    available_at_home: false,
    home_price: null,
    home_min_order_value: null,
    home_min_items: null,
    home_travel_fee: null,
    home_service_radius_km: null,
    is_enabled: true
  };
  const [formData, setFormData] = useState(_defaultFormData);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (service) {
      // Merge with defaults so old services without at-home fields don't crash inputs.
      setFormData({ ..._defaultFormData, ...service });
    } else {
      setFormData(_defaultFormData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploadingImage(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ 
        ...prev, 
        images: [...(prev.images || []), reader.result] 
      }));
      setUploadingImage(false);
      toast.success('Image uploaded successfully');
    };
    reader.onerror = () => {
      toast.error('Failed to upload image');
      setUploadingImage(false);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (index) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (service) {
        // Update
        await axios.put(
          `${API}/services/${service.id}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Service updated successfully');
      } else {
        // Create
        await axios.post(
          `${API}/services`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Service created successfully');
      }
      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving service:', error);
      toast.error('Failed to save service');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{service ? 'Edit Service' : 'Add New Service'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Service Name *</Label>
              <Input
                value={formData.service_name}
                onChange={(e) => setFormData({...formData, service_name: e.target.value})}
                required
              />
            </div>

            <div>
              <Label>Category *</Label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                required
              />
            </div>

            <div>
              <Label>Gender *</Label>
              <select
                value={formData.gender_tag}
                onChange={(e) => setFormData({...formData, gender_tag: e.target.value})}
                className="w-full p-2 bg-background border border-border rounded-md"
              >
                <option value="Unisex">Unisex</option>
                <option value="Men">Men</option>
                <option value="Women">Women</option>
              </select>
            </div>

            <div>
              <Label>Duration (minutes) *</Label>
              <Input
                type="number"
                value={formData.default_duration}
                onChange={(e) => setFormData({...formData, default_duration: parseInt(e.target.value)})}
                required
              />
            </div>

            <div>
              <Label>Base Price (₹) *</Label>
              <Input
                type="number"
                value={formData.base_price}
                onChange={(e) => setFormData({...formData, base_price: parseFloat(e.target.value)})}
                required
              />
            </div>

            <div>
              <Label>Price Type *</Label>
              <select
                value={formData.price_type}
                onChange={(e) => setFormData({...formData, price_type: e.target.value})}
                className="w-full p-2 bg-background border border-border rounded-md"
              >
                <option value="fixed">Fixed</option>
                <option value="onwards">Onwards</option>
              </select>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full p-2 bg-background border border-border rounded-md min-h-[80px]"
            />
          </div>

          {/* Image Upload */}
          <div>
            <Label>Service Images</Label>
            <div className="space-y-2">
              <Input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploadingImage}
              />
              {formData.images && formData.images.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {formData.images.map((img, index) => (
                    <div key={`${img}-${index}`} className="relative">
                      <img 
                        src={img} 
                        alt={`Service ${index + 1}`} 
                        className="w-full h-24 object-cover rounded-lg border border-border"
                      />
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {uploadingImage && <p className="text-sm text-muted-foreground">Uploading...</p>}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={formData.available_at_home}
                onCheckedChange={(checked) => setFormData({...formData, available_at_home: checked})}
                data-testid="service-form-at-home-toggle"
              />
              <Home className="w-4 h-4" />
              <span className="text-sm">Available at Home</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={formData.is_enabled}
                onCheckedChange={(checked) => setFormData({...formData, is_enabled: checked})}
              />
              <span className="text-sm">Service Enabled</span>
            </label>
          </div>

          {/* Item 4 — At-home pricing sub-panel (visible only when At Home is on) */}
          {formData.available_at_home && (
            <div className="rounded-lg border border-dashed border-gold/40 bg-gold/5 p-4 space-y-3" data-testid="service-form-at-home-panel">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Home className="w-4 h-4 text-gold" /> At-home settings
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Home price (₹)</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    placeholder={`Defaults to ₹${formData.base_price || 0}`}
                    value={formData.home_price ?? ''}
                    onChange={(e) => setFormData({...formData, home_price: e.target.value === '' ? null : parseFloat(e.target.value)})}
                    data-testid="service-form-home-price"
                  />
                </div>
                <div>
                  <Label className="text-xs">Travel fee (₹)</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    placeholder="Optional flat fee"
                    value={formData.home_travel_fee ?? ''}
                    onChange={(e) => setFormData({...formData, home_travel_fee: e.target.value === '' ? null : parseFloat(e.target.value)})}
                    data-testid="service-form-home-travel-fee"
                  />
                </div>
                <div>
                  <Label className="text-xs">Minimum order value (₹)</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    placeholder="MOQ on cart"
                    value={formData.home_min_order_value ?? ''}
                    onChange={(e) => setFormData({...formData, home_min_order_value: e.target.value === '' ? null : parseFloat(e.target.value)})}
                    data-testid="service-form-home-moq"
                  />
                </div>
                <div>
                  <Label className="text-xs">Minimum items</Label>
                  <Input
                    type="number" min="1" step="1"
                    placeholder="e.g. 2"
                    value={formData.home_min_items ?? ''}
                    onChange={(e) => setFormData({...formData, home_min_items: e.target.value === '' ? null : parseInt(e.target.value, 10)})}
                    data-testid="service-form-home-min-items"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Service radius (km)</Label>
                  <Input
                    type="number" min="0" step="0.5"
                    placeholder="e.g. 5"
                    value={formData.home_service_radius_km ?? ''}
                    onChange={(e) => setFormData({...formData, home_service_radius_km: e.target.value === '' ? null : parseFloat(e.target.value)})}
                    data-testid="service-form-home-radius"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Customers booking this service at home will see the home price and must meet the MOQ + min-items before checkout. All fields are optional.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit">
              <Save className="w-4 h-4 mr-2" />
              {service ? 'Update' : 'Create'} Service
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Package Modal Component
function PackageModal({ package: pkg, services, open, onClose, onSave, token, salonId }) {
  const [formData, setFormData] = useState({
    salon_id: salonId,
    package_name: '',
    description: '',
    service_ids: [],
    total_price: 0,
    image_url: '',
    gender_tag: 'Unisex'
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (pkg) {
      setFormData({ ...pkg, salon_id: salonId });
    } else {
      setFormData({
        salon_id: salonId,
        package_name: '',
        description: '',
        service_ids: [],
        total_price: 0,
        image_url: '',
        gender_tag: 'Unisex'
      });
    }
    setSearchQuery('');
  }, [pkg, salonId]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploadingImage(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData(prev => ({ ...prev, image_url: reader.result }));
      setUploadingImage(false);
      toast.success('Image uploaded successfully');
    };
    reader.onerror = () => {
      toast.error('Failed to upload image');
      setUploadingImage(false);
    };
    reader.readAsDataURL(file);
  };

  const toggleService = (serviceId) => {
    setFormData(prev => ({
      ...prev,
      service_ids: prev.service_ids.includes(serviceId)
        ? prev.service_ids.filter(id => id !== serviceId)
        : [...prev.service_ids, serviceId]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      if (pkg) {
        await axios.put(
          `${API}/salons/${salonId}/packages/${pkg.id}`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Package updated successfully');
      } else {
        await axios.post(
          `${API}/salons/${salonId}/packages`,
          formData,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success('Package created successfully');
      }
      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving package:', error);
      toast.error('Failed to save package');
    }
  };

  // Filter services based on search query
  const filteredServices = services.filter(service =>
    service.service_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    service.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate total from selected services
  const calculateTotal = () => {
    return services
      .filter(s => formData.service_ids.includes(s.id))
      .reduce((sum, s) => sum + s.base_price, 0);
  };

  const autoCalculateTotal = () => {
    const total = calculateTotal();
    setFormData(prev => ({ ...prev, total_price: total }));
    toast.success(`Total calculated: ₹${total}`);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{pkg ? 'Edit Package' : 'Create New Package'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Package Name *</Label>
              <Input
                value={formData.package_name}
                onChange={(e) => setFormData({...formData, package_name: e.target.value})}
                required
                placeholder="e.g., Bridal Package 1"
              />
            </div>

            <div>
              <Label>Total Price (₹) *</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={formData.total_price}
                  onChange={(e) => setFormData({...formData, total_price: parseFloat(e.target.value)})}
                  required
                  placeholder="6999"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={autoCalculateTotal}
                  title="Auto-calculate from selected services"
                >
                  Σ
                </Button>
              </div>
            </div>

            <div>
              <Label>Gender Tag *</Label>
              <select
                value={formData.gender_tag}
                onChange={(e) => setFormData({...formData, gender_tag: e.target.value})}
                className="w-full p-2 bg-background border border-border rounded-md"
              >
                <option value="Unisex">Unisex</option>
                <option value="Men">Men</option>
                <option value="Women">Women</option>
              </select>
            </div>

            <div className="col-span-2">
              <Label>Package Image</Label>
              <div className="space-y-2">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                />
                {formData.image_url && (
                  <div className="relative">
                    <img 
                      src={formData.image_url} 
                      alt="Package preview" 
                      className="w-full h-40 object-cover rounded-lg border border-border"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                      className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {uploadingImage && <p className="text-sm text-muted-foreground">Uploading...</p>}
              </div>
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="w-full p-2 bg-background border border-border rounded-md min-h-[80px]"
              placeholder="Package description..."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Select Services ({formData.service_ids.length} selected, Total: ₹{calculateTotal()})</Label>
            </div>

            {/* Search Box */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search services by name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Services List */}
            <div className="max-h-80 overflow-y-auto border border-border rounded-md p-3 space-y-2">
              {filteredServices.length > 0 ? (
                filteredServices.map(service => (
                  <label key={service.id} className="flex items-center gap-3 p-3 hover:bg-muted rounded cursor-pointer border border-transparent hover:border-gold/30 transition-colors">
                    <Checkbox
                      checked={formData.service_ids.includes(service.id)}
                      onCheckedChange={() => toggleService(service.id)}
                      className="flex-shrink-0"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{service.service_name}</span>
                        <span className="text-xs px-2 py-0.5 bg-muted rounded">
                          {service.category}
                        </span>
                      </div>
                      {service.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{service.description}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gold ml-auto flex-shrink-0">
                      ₹{service.base_price}
                    </span>
                  </label>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No services found</p>
                  {searchQuery && (
                    <p className="text-xs mt-1">Try adjusting your search</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={formData.service_ids.length === 0}>
              <Save className="w-4 h-4 mr-2" />
              {pkg ? 'Update' : 'Create'} Package
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}