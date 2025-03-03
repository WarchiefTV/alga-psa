'use client';

import React, { useState, useEffect } from 'react';
import { DialogContent, DialogTitle } from '@radix-ui/react-dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { TextArea } from '@/components/ui/TextArea';
import { format } from 'date-fns';
import { IScheduleEntry, IRecurrencePattern } from '../../interfaces/schedule.interfaces';
import { WorkItemPicker } from './WorkItemPicker';
import { IWorkItem } from '../../interfaces/workItem.interfaces';
import { getWorkItemById } from '../../lib/actions/workItemActions';
import CustomSelect from '../ui/CustomSelect';
import SelectedWorkItem from './SelectedWorkItem';
import MultiUserPicker from '../ui/MultiUserPicker';
import { DateTimePicker } from '../ui/DateTimePicker';
import { IUserWithRoles } from '../../interfaces/auth.interfaces';

interface EntryPopupProps {
  event: IScheduleEntry | null;
  slot: any;
  onClose: () => void;
  onSave: (entryData: Omit<IScheduleEntry, 'tenant'>) => void;
  canAssignMultipleAgents: boolean;
  users: IUserWithRoles[];
  loading?: boolean;
  error?: string | null;
}

const EntryPopup: React.FC<EntryPopupProps> = ({ 
  event, 
  slot, 
  onClose, 
  onSave, 
  canAssignMultipleAgents,
  users,
  loading = false,
  error = null
}) => {
  const [entryData, setEntryData] = useState<Omit<IScheduleEntry, 'tenant'>>(() => {
    if (event) {
      return {
        ...event,
        scheduled_start: new Date(event.scheduled_start),
        scheduled_end: new Date(event.scheduled_end),
        assigned_user_ids: event.assigned_user_ids,
      };
    } else if (slot) {
      return {
        entry_id: '',
        title: '',
        scheduled_start: new Date(slot.start),
        scheduled_end: new Date(slot.end),
        notes: '',
        created_at: new Date(),
        updated_at: new Date(),
        work_item_id: null,
        status: 'scheduled',
        work_item_type: 'ad_hoc',
        assigned_user_ids: [],
      };
    } else {
      return {
        entry_id: '',
        title: '',
        scheduled_start: new Date(),
        scheduled_end: new Date(),
        notes: '',
        created_at: new Date(),
        updated_at: new Date(),
        work_item_id: null,
        status: 'scheduled',
        work_item_type: 'ad_hoc',
        assigned_user_ids: [],
      };
    }
  });
  const [selectedWorkItem, setSelectedWorkItem] = useState<Omit<IWorkItem, 'tenant'> | null>(null);
  const [recurrencePattern, setRecurrencePattern] = useState<IRecurrencePattern | null>(null);
  const [isEditingWorkItem, setIsEditingWorkItem] = useState(false);

  useEffect(() => {
    const initializeData = () => {
      if (event) {
        setEntryData({
          ...event,
          scheduled_start: new Date(event.scheduled_start),
          scheduled_end: new Date(event.scheduled_end),
          assigned_user_ids: event.assigned_user_ids,
          work_item_id: event.work_item_id,
        });

        // Load recurrence pattern if it exists
        if (event.recurrence_pattern) {
          setRecurrencePattern({
            ...event.recurrence_pattern,
            startDate: new Date(event.recurrence_pattern.startDate),
            endDate: event.recurrence_pattern.endDate ? new Date(event.recurrence_pattern.endDate) : undefined,
          });
        }

        // Fetch work item information if editing an existing entry
        if (event.work_item_id && event.work_item_type !== 'ad_hoc') {
          getWorkItemById(event.work_item_id, event.work_item_type).then((workItem) => {
            if (workItem) {
              setSelectedWorkItem(workItem);
            }
          });
        }
      } else if (slot) {
        setEntryData({
          entry_id: '',
          title: '',
          scheduled_start: new Date(slot.start),
          scheduled_end: new Date(slot.end),
          notes: '',
          created_at: new Date(),
          updated_at: new Date(),
          work_item_id: null,
          status: 'scheduled',
          work_item_type: 'ad_hoc',
          assigned_user_ids: [],
        });
      }
    };

    initializeData();
  }, [event, slot]);

  const recurrenceOptions = [
    { value: 'none', label: 'None' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' }
  ];

  const endTypeOptions = [
    { value: 'never', label: 'Never' },
    { value: 'date', label: 'On Date' },
    { value: 'count', label: 'After' }
  ];

  const handleRecurrenceChange = (value: string) => {
    if (value === 'none') {
      setRecurrencePattern(null);
    } else {
      setRecurrencePattern(prev => ({
        frequency: value as IRecurrencePattern['frequency'],
        interval: 1,
        startDate: entryData.scheduled_start,
        endDate: undefined,
        count: undefined,
      }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEntryData((prev) => ({
      ...prev,
      [name]: name === 'scheduled_start' || name === 'scheduled_end' ? new Date(value) : value,
    }));
  };

  const handleWorkItemSelect = (workItem: IWorkItem | null) => {
    setSelectedWorkItem(workItem);
    setEntryData(prev => ({
      ...prev,
      work_item_id: workItem ? workItem.work_item_id : null,
      title: workItem ? workItem.name : prev.title,
      work_item_type: workItem?.type || 'ad_hoc'
    }));
    setIsEditingWorkItem(false);
  };

  const handleEndTypeChange = (value: string) => {
    setRecurrencePattern(prev => {
      if (prev === null) return null;
      return {
        ...prev,
        endDate: value === 'date' ? new Date() : undefined,
        count: value === 'count' ? 1 : undefined
      };
    });
  };

  const handleAssignedUsersChange = (userIds: string[]) => {
    setEntryData(prev => ({
      ...prev,
      assigned_user_ids: userIds,
    }));
  };

  const handleSave = () => {
    // Ensure required fields are present
    if (!entryData.title) {
      alert('Title is required');
      return;
    }

    // Prepare entry data
    const savedEntryData = {
      ...entryData,
      recurrence_pattern: recurrencePattern || null,
      // For ad-hoc entries, ensure work_item_id is null and type is 'ad_hoc'
      work_item_id: entryData.work_item_type === 'ad_hoc' ? null : entryData.work_item_id,
      status: entryData.status || 'scheduled',
      // Ensure assigned_user_ids is an array
      assigned_user_ids: Array.isArray(entryData.assigned_user_ids) ? entryData.assigned_user_ids : []
    };

    // Log the data being saved
    console.log('Saving schedule entry:', savedEntryData);

    onSave(savedEntryData);
  };

  return (
    <DialogContent className="bg-white p-4 rounded-lg shadow-lg fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 max-w-[90vw] w-[550px] h-auto max-h-[90vh] flex flex-col transition-all duration-300 overflow-y-auto">
       <div className="shrink-0 pb-4 border-b">
        <DialogTitle className="text-xl font-bold">
          {event ? 'Edit Entry' : 'New Entry'}
        </DialogTitle>
      </div>
      <div className="flex-1 overflow-y-auto space-y-4 p-1">
        <div className="min-w-0">
          {isEditingWorkItem ? (
            <div className="w-full min-w-[min(100%,400px)]">
              <WorkItemPicker
              onSelect={handleWorkItemSelect}
              existingWorkItems={[]} // Pass existing work items if needed
              initialWorkItemId={event?.work_item_id}
              initialWorkItemType={event?.work_item_type}
              />
            </div>
            ) : (
              <SelectedWorkItem
                workItem={selectedWorkItem}
                onEdit={() => setIsEditingWorkItem(true)}
              />
            )}
          </div>
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title
            </label>
            <Input
              id="title"
              name="title"
              value={entryData.title}
              onChange={handleInputChange}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            />
          </div>
          {canAssignMultipleAgents && (
            <div>
              <label htmlFor="assigned_users" className="block text-sm font-medium text-gray-700 mb-1">
                Assigned Users
              </label>
              <MultiUserPicker
                values={entryData.assigned_user_ids || []}
                onValuesChange={handleAssignedUsersChange}
                users={users}
                loading={loading}
                error={error}
              />
            </div>
          )}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Start</label>
              <DateTimePicker
                id="scheduled_start"
                value={entryData.scheduled_start}
                onChange={(date) => {
                  setEntryData(prev => ({
                    ...prev,
                    scheduled_start: date
                  }));
                }}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">End</label>
              <DateTimePicker
                id="scheduled_end"
                value={entryData.scheduled_end}
                onChange={(date) => {
                  setEntryData(prev => ({
                    ...prev,
                    scheduled_end: date
                  }));
                }}
                className="mt-1"
                minDate={entryData.scheduled_start}
              />
            </div>
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
              Notes
            </label>
            <TextArea
              id="notes"
              name="notes"
              value={entryData.notes}
              onChange={handleInputChange}
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
            />
          </div>
        </div>
        <div className="space-y-4">
          <div className="relative z-10">
            <CustomSelect
              label="Recurrence"
              value={recurrencePattern?.frequency || 'none'}
              onValueChange={handleRecurrenceChange}
              options={recurrenceOptions}
            />
          </div>
        </div>
        {recurrencePattern && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label htmlFor="interval" className="block text-sm font-medium text-gray-700">
                  Interval
                </label>
                <Input
                  id="interval"
                  type="number"
                  value={recurrencePattern.interval}
                  onChange={(e) => setRecurrencePattern(prev => {
                    if (prev === null) return null;
                    return { ...prev, interval: parseInt(e.target.value) };
                  })}
                  min={1}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                />
              </div>
              <div className="flex-1">
                <CustomSelect
                  label="End"
                  value={recurrencePattern.endDate ? 'date' : recurrencePattern.count ? 'count' : 'never'}
                  onValueChange={handleEndTypeChange}
                  options={endTypeOptions}
                />
              </div>
            </div>
            {recurrencePattern.endDate && (
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">
                  End Date
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={format(recurrencePattern.endDate, 'yyyy-MM-dd')}
                  onChange={(e) => setRecurrencePattern(prev => {
                    if (prev === null) return null;
                    return { ...prev, endDate: new Date(e.target.value) };
                  })}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                />
              </div>
            )}
            {recurrencePattern.count && (
              <div>
                <label htmlFor="count" className="block text-sm font-medium text-gray-700">
                  Occurrences
                </label>
                <Input
                  id="count"
                  type="number"
                  value={recurrencePattern.count}
                  onChange={(e) => setRecurrencePattern(prev => {
                    if (prev === null) return null;
                    return { ...prev, count: parseInt(e.target.value) };
                  })}
                  min={1}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                />
              </div>
            )}
          </div>
        )}
      <div className="mt-6 flex justify-end space-x-3">
        <Button id="cancel-entry-btn" onClick={onClose} variant="outline">
          Cancel
        </Button>
        <Button id="save-entry-btn" onClick={handleSave}>Save</Button>
      </div>
    </DialogContent>
  );
};

export default EntryPopup;
