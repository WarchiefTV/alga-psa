// server/src/components/QuickAddContact.tsx
import React, { useState, useEffect } from 'react';
import { useAutomationIdAndRegister } from '@/types/ui-reflection/useAutomationIdAndRegister';
import { ReflectionContainer } from '@/types/ui-reflection/ReflectionContainer';
import { FormComponent, FormFieldComponent, ButtonComponent, ContainerComponent } from '@/types/ui-reflection/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { TextArea } from "@/components/ui/TextArea";
import { addContact } from '@/lib/actions/contact-actions/contactActions';
import { CompanyPicker } from '@/components/companies/CompanyPicker';
import { ICompany } from '@/interfaces/company.interfaces';
import { IContact } from '@/interfaces/contact.interfaces';
import { Switch } from '@/components/ui/Switch';

interface QuickAddContactProps {
  isOpen: boolean;
  onClose: () => void;
  onContactAdded: (newContact: IContact) => void;
  companies: ICompany[];
  selectedCompanyId?: string | null;
}

export const QuickAddContact: React.FC<QuickAddContactProps> = ({
  isOpen,
  onClose,
  onContactAdded,
  companies,
  selectedCompanyId = null
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<'all' | 'active' | 'inactive'>('all');
  const [clientTypeFilter, setClientTypeFilter] = useState<'all' | 'company' | 'individual'>('all');
  const [isInactive, setIsInactive] = useState(false);
  const [role, setRole] = useState('');
  const [notes, setNotes] = useState('');


  // Set initial company ID when the component mounts or when selectedCompanyId changes
  useEffect(() => {
    setCompanyId(selectedCompanyId);
  }, [selectedCompanyId]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setCompanyId(selectedCompanyId);
    } else {
      setFullName('');
      setEmail('');
      setPhoneNumber('');
      setCompanyId(null);
      setIsInactive(false);
      setRole('');
      setNotes('');
    }
  }, [isOpen, selectedCompanyId]);

  const handleCompanySelect = (companyId: string | null) => {
    setCompanyId(companyId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newContact = await addContact({
        full_name: fullName,
        email: email,
        phone_number: phoneNumber,
        company_id: companyId || undefined,
        is_inactive: isInactive,
        role: role,
        notes: notes,
      });
      onContactAdded(newContact);
      onClose();
    } catch (error) {
      console.error('Error adding contact:', error);
    }
  };

  return (
    <Dialog id="quick-add-contact-dialog" isOpen={isOpen} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Add New Contact</DialogTitle>
      </DialogHeader>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="quick-add-contact-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="quick-add-contact-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="quick-add-contact-phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Input
                id="quick-add-contact-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g., Manager, Developer, etc."
              />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <TextArea
                id="quick-add-contact-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional notes about the contact..."
              />
            </div>
            <div>
              <Label>Company (Optional)</Label>
              <CompanyPicker
                id="quick-add-contact-company"
                companies={companies}
                onSelect={handleCompanySelect}
                selectedCompanyId={companyId}
                filterState={filterState}
                onFilterStateChange={setFilterState}
                clientTypeFilter={clientTypeFilter}
                onClientTypeFilterChange={setClientTypeFilter}
              />
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center space-x-2">
                <Label htmlFor="inactive-switch">Status</Label>
                <span className="text-sm text-gray-500">
                  {isInactive ? 'Inactive' : 'Active'}
                </span>
              </div>
              <Switch
                id="quick-add-contact-status"
                checked={isInactive}
                onCheckedChange={setIsInactive}
                className="data-[state=checked]:bg-primary-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button id="quick-add-contact-cancel" type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button id="quick-add-contact-submit" type="submit">Add Contact</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default QuickAddContact;
