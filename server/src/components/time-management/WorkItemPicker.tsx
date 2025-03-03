'use client'
import { useState, useEffect, useCallback } from 'react';
import { Filter, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { SwitchWithLabel } from '@/components/ui/SwitchWithLabel';
import { IWorkItem, IExtendedWorkItem, WorkItemType } from '@/interfaces/workItem.interfaces';
import { searchWorkItems, createWorkItem } from '@/lib/actions/workItemActions';
import { Button } from '@/components/ui/Button';
import UserPicker from '@/components/ui/UserPicker';
import { CompanyPicker } from '@/components/companies/CompanyPicker';
import { DatePicker } from '@/components/ui/DatePicker';
import { DateTimePicker } from '@/components/ui/DateTimePicker';
import { IUserWithRoles } from '@/interfaces/auth.interfaces';
import { getAllUsers, getCurrentUser } from '@/lib/actions/user-actions/userActions';
import { getAllCompanies } from '@/lib/actions/companyActions';
import { ICompany } from '@/interfaces/company.interfaces';
import CustomSelect from '@/components/ui/CustomSelect';

interface WorkItemPickerProps {
  onSelect: (workItem: IWorkItem | null) => void;
  existingWorkItems: IWorkItem[];
  initialWorkItemId?: string | null;
  initialWorkItemType?: WorkItemType;
}

interface WorkItemWithStatus extends Omit<IExtendedWorkItem, "tenant"> {
  status: string;
}

export function WorkItemPicker({ onSelect, existingWorkItems }: WorkItemPickerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [workItems, setWorkItems] = useState<WorkItemWithStatus[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [companyId, setCompanyId] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [users, setUsers] = useState<IUserWithRoles[]>([]);
  const [companies, setCompanies] = useState<ICompany[]>([]);
  const [filterState, setFilterState] = useState<'all' | 'active' | 'inactive'>('active');
  const [clientTypeFilter, setClientTypeFilter] = useState<'all' | 'company' | 'individual'>('all');
  const [isFiltersExpanded, setIsFiltersExpanded] = useState(false);
  const [showAdHocForm, setShowAdHocForm] = useState(false);
  const [adHocTitle, setAdHocTitle] = useState('');
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [endTime, setEndTime] = useState<Date>(() => {
    const date = new Date();
    date.setHours(date.getHours() + 1); // Default to 1 hour duration
    return date;
  });
  const [searchType, setSearchType] = useState<WorkItemType | 'all'>('all');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [fetchedUsers, fetchedCompanies] = await Promise.all([
          getAllUsers(),
          getAllCompanies()
        ]);
        setUsers(fetchedUsers);
        setCompanies(fetchedCompanies);
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    loadData();
  }, []);

  // Handle "Assigned to me" toggle
  const handleAssignedToMeChange = async (checked: boolean) => {
    setAssignedToMe(checked);
    if (checked) {
      try {
        const currentUser = await getCurrentUser();
        if (currentUser) {
          setAssignedTo(currentUser.user_id);
        }
      } catch (error) {
        console.error('Error getting current user:', error);
      }
    } else {
      setAssignedTo('');
    }
    setCurrentPage(1);
    loadWorkItems(searchTerm, 1);
  };
  const pageSize = 20;

  const loadWorkItems = useCallback(async (term: string, page: number) => {
    setIsSearching(true);
    try {
      const result = await searchWorkItems({ 
        searchTerm: term,
        page,
        pageSize,
        sortBy: 'name',
        sortOrder: 'asc',
        includeInactive,
        assignedTo: assignedTo || undefined,
        assignedToMe,
        companyId: companyId || undefined,
        type: searchType,
        dateRange: startDate || endDate ? {
          start: startDate,
          end: endDate
        } : undefined
      });
      
      // Filter out items that are already on the timesheet
      const existingIds = new Set(existingWorkItems.map((item): string => item.work_item_id));
      const filteredItems = result.items.filter(item => !existingIds.has(item.work_item_id));
      
      const itemsWithStatus = filteredItems.map((item): WorkItemWithStatus => ({ 
        work_item_id: item.work_item_id,
        type: item.type,
        name: item.name,
        description: item.description,
        is_billable: item.is_billable,
        ticket_number: item.ticket_number,
        title: item.title,
        project_name: item.project_name,
        phase_name: item.phase_name,
        task_name: item.task_name,
        status: 'Active'
      }));

      setWorkItems(itemsWithStatus);
      setTotal(result.total);
      setHasMore(result.total > page * pageSize);
    } catch (error) {
      console.error('Error loading work items:', error);
      // Show error state in the list
      setWorkItems([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setIsSearching(false);
    }
  }, [existingWorkItems, includeInactive, assignedTo, assignedToMe, companyId, startDate, endDate, searchType]);

  // Load initial items when component mounts
  useEffect(() => {
    loadWorkItems('', 1);
  }, [loadWorkItems]);

  const debouncedSearch = useCallback(
    debounce((term: string) => {
      setCurrentPage(1);
      loadWorkItems(term, 1);
    }, 200),
    [loadWorkItems]
  );

  useEffect(() => {
    debouncedSearch(searchTerm);
  }, [searchTerm, debouncedSearch]);

  const handlePageChange = (newPage: number) => {
    if (!isSearching && newPage >= 1 && newPage <= Math.ceil(total / pageSize)) {
      setCurrentPage(newPage);
      loadWorkItems(searchTerm, newPage);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  const renderWorkItemContent = (item: WorkItemWithStatus) => {
    if (item.type === 'ticket') {
      return (
        <>
          <div className="font-medium text-[rgb(var(--color-text-900))]">
            {item.ticket_number} - {item.title || 'Untitled'}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[rgb(var(--color-primary-100))] text-[rgb(var(--color-primary-900))]">
              Ticket
            </span>
            {item.is_billable && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[rgb(var(--color-accent-100))] text-[rgb(var(--color-accent-900))]">
                Billable
              </span>
            )}
          </div>
        </>
      );
    } else if (item.type === 'project_task') {
      return (
        <>
          <div className="font-medium text-[rgb(var(--color-text-900))]">
            {item.project_name}
          </div>
          <div className="text-sm text-[rgb(var(--color-text-600))]">
            {item.phase_name} → {item.task_name}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[rgb(var(--color-primary-100))] text-[rgb(var(--color-primary-900))]">
              Project Task
            </span>
            {item.is_billable && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[rgb(var(--color-accent-100))] text-[rgb(var(--color-accent-900))]">
                Billable
              </span>
            )}
          </div>
        </>
      );
    } else if (item.type === 'ad_hoc') {
      return (
        <>
          <div className="font-medium text-[rgb(var(--color-text-900))]">
            {item.title || item.name}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[rgb(var(--color-primary-100))] text-[rgb(var(--color-primary-900))]">
              Ad-hoc Entry
            </span>
            {item.is_billable && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[rgb(var(--color-accent-100))] text-[rgb(var(--color-accent-900))]">
                Billable
              </span>
            )}
          </div>
        </>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-auto max-h-[70vh] min-h-[200px] transition-all duration-300 ease-in-out">
      <div className="flex-none bg-white dark:bg-[rgb(var(--color-border-50))] pb-4 overflow-visible">
        <div className="flex justify-between items-center mb-4">
          {!showAdHocForm ? (
            <Button
              onClick={() => setShowAdHocForm(true)}
              variant="outline"
              className="text-sm"
              id="create-adhoc-entry-btn"
            >
              Create Ad-hoc Entry
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-2 w-full">
                <Input
                  value={adHocTitle}
                  onChange={(e) => setAdHocTitle(e.target.value)}
                  placeholder="Enter title for ad-hoc entry"
                  className="flex-1"
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-2">
                  <DateTimePicker
                    value={startTime}
                    onChange={setStartTime}
                    placeholder="Start time"
                    id="adhoc-start-time"
                  />
                  <DateTimePicker
                    value={endTime}
                    onChange={setEndTime}
                    placeholder="End time"
                    id="adhoc-end-time"
                    minDate={startTime}
                  />
                </div>
              </div>
              <Button
                onClick={async () => {
                  if (!adHocTitle.trim()) return;
                  
                  try {
                    const newItem = await createWorkItem({
                      type: 'ad_hoc',
                      name: adHocTitle,
                      title: adHocTitle,
                      is_billable: true,
                      description: '',
                      startTime,
                      endTime
                    });
                    
                    // Add to existing work items to prevent duplicate showing
                    existingWorkItems.push(newItem);
                    onSelect(newItem);
                    
                    // Reset form
                    setShowAdHocForm(false);
                    setAdHocTitle('');
                  } catch (error) {
                    console.error('Error creating ad-hoc entry:', error);
                    // TODO: Show error to user
                  }
                }}
                variant="outline"
                className="text-sm whitespace-nowrap"
                disabled={!adHocTitle.trim()}
                id="save-adhoc-entry-btn"
              >
                Save Entry
              </Button>
              <Button
                onClick={() => {
                  setShowAdHocForm(false);
                  setAdHocTitle('');
                }}
                variant="ghost"
                className="text-sm"
                id="cancel-adhoc-entry-btn"
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search work items..."
              className="pl-8 bg-white dark:bg-[rgb(var(--color-border-50))] border-[rgb(var(--color-border-200))]"
            />
            <svg
              className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[rgb(var(--color-text-400))]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {isSearching && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[rgb(var(--color-primary-500))]"></div>
              </div>
            )}
          </div>
          <SwitchWithLabel
            label="Include inactive"
            checked={includeInactive}
            onCheckedChange={(checked) => {
              setIncludeInactive(checked);
              setCurrentPage(1);
              loadWorkItems(searchTerm, 1);
            }}
            className="text-sm text-[rgb(var(--color-text-600))]"
          />
          <Button
            id="toggle-filters-btn"
            variant="ghost"
            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
            className="flex items-center gap-2 bg-[rgb(var(--color-primary-100))] hover:bg-[rgb(var(--color-primary-100))]"
          >
            <Filter className="h-4 w-4" />
            Filters
            <svg
              className={`h-4 w-4 transition-transform ${isFiltersExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </Button>
        </div>
        <div className="relative">
          <div className={`space-y-4 transition-all duration-300 ease-in-out ${isFiltersExpanded ? 'max-h-[500px] opacity-100 pointer-events-auto' : 'max-h-0 opacity-0 pointer-events-none'}`} style={{ overflow: 'visible', zIndex: 600 }}>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-4">
                <UserPicker
                  label="Assigned to"
                  value={assignedTo}
                  onValueChange={(value) => {
                    setAssignedTo(value);
                    setCurrentPage(1);
                    loadWorkItems(searchTerm, 1);
                  }}
                  disabled={assignedToMe}
                  users={users}
                />
                <SwitchWithLabel
                  label="Assigned to me"
                  checked={assignedToMe}
                  onCheckedChange={handleAssignedToMeChange}
                  className="text-sm text-[rgb(var(--color-text-600))]"
                />
              </div>

            <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAssignedTo('');
                    setAssignedToMe(false);
                    setCompanyId('');
                    setStartDate(undefined);
                    setEndDate(undefined);
                    setFilterState('active');
                    setClientTypeFilter('all');
                    setSearchType('all');
                    setCurrentPage(1);
                    loadWorkItems(searchTerm, 1);
                  }}
                  className="whitespace-nowrap flex items-center gap-2"
                  id="reset-filters"
                >
                  <XCircle className="h-4 w-4" />
                  Reset Filters
                </Button>
              </div>
              </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="flex items-center">
                <CompanyPicker
                  id="work-item-company-picker"
                  selectedCompanyId={companyId}
                  onSelect={(value: string) => {
                    setCompanyId(value);
                    setCurrentPage(1);
                    loadWorkItems(searchTerm, 1);
                  }}
                  filterState={filterState}
                  onFilterStateChange={setFilterState}
                  clientTypeFilter={clientTypeFilter}
                  onClientTypeFilterChange={setClientTypeFilter}
                  companies={companies}
                  fitContent
                />
              </div>
              <div className="flex items-center">
                <CustomSelect
                  value={searchType}
                  onValueChange={(value) => {
                    setSearchType(value as WorkItemType | 'all');
                    setCurrentPage(1);
                    loadWorkItems(searchTerm, 1);
                  }}
                  options={[
                    { value: 'all', label: 'All Types' },
                    { value: 'ticket', label: 'Tickets' },
                    { value: 'project_task', label: 'Project Tasks' },
                    { value: 'ad_hoc', label: 'Ad-hoc Entries' }
                  ]}
                  className="w-40"
                />
              </div>
              <div className="flex items-center">
                <DatePicker
                  label="Start date"
                  value={startDate}
                  onChange={(date) => {
                    setStartDate(date);
                    setCurrentPage(1);
                    loadWorkItems(searchTerm, 1);
                  }}
                  placeholder="Start date"
                  className="w-full"
                />
              </div>
              <div className="flex items-center">
                <DatePicker
                  label="End date"
                  value={endDate}
                  onChange={(date) => {
                    setEndDate(date);
                    setCurrentPage(1);
                    loadWorkItems(searchTerm, 1);
                  }}
                  placeholder="End date"
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-[200px] overflow-auto transition-all duration-300">
        <div className="h-full overflow-y-auto">
          <div className="bg-white dark:bg-[rgb(var(--color-border-50))] rounded-md border border-[rgb(var(--color-border-200))]">
            {workItems.length > 0 ? (
              <div>
                <ul className="divide-y divide-[rgb(var(--color-border-200))]">
                  {workItems.map((item): JSX.Element => (
                    <li
                      key={item.work_item_id}
                      className="bg-[rgb(var(--color-border-50))] hover:bg-[rgb(var(--color-border-100))] cursor-pointer transition-colors duration-150"
                      onClick={() => onSelect(item)}
                    >
                      <div className="px-4 py-3">
                        {renderWorkItemContent(item)}
                      </div>
                    </li>
                  ))}
                </ul>
                {totalPages > 1 && (
                  <div className="p-2 border-t border-[rgb(var(--color-border-200))] flex items-center justify-between">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      className="px-3 py-1 text-sm font-medium text-[rgb(var(--color-text-600))] hover:text-[rgb(var(--color-text-900))] hover:bg-[rgb(var(--color-border-100))] rounded-md transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={currentPage === 1 || isSearching}
                      id="previous-page-btn"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-[rgb(var(--color-text-600))]">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      className="px-3 py-1 text-sm font-medium text-[rgb(var(--color-text-600))] hover:text-[rgb(var(--color-text-900))] hover:bg-[rgb(var(--color-border-100))] rounded-md transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!hasMore || isSearching}
                      id="next-page-btn"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            ) : searchTerm && !isSearching ? (
              <div className="p-4 text-center text-[rgb(var(--color-text-500))]">
                No work items found. Try adjusting your search terms.
              </div>
            ) : !isSearching ? (
              <div className="p-4 text-center text-[rgb(var(--color-text-500))]">
                No available work items.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// Debounce function
function debounce<F extends (...args: any[]) => any>(func: F, wait: number): F {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return function(this: any, ...args: Parameters<F>) {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func.apply(this, args), wait);
  } as F;
}
