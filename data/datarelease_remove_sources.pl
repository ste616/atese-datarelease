#!/usr/bin/perl

use JSON;
use strict;

my $od = "/DATA/KAPUTAR_4/ste616/data_reduction/C2914/datarelease";

# We can accept any number of sources to remove.
my @src_names = @ARGV;

# Begin by making a backup file.
my $catname = $od."/datarelease_catalogue.json";
my $bakname = $catname.".bak";

print "Creating backup catalogue file $bakname...\n";
print "cp $catname $bakname\n";
system "cp $catname $bakname";

print "Reading catalogue...\n";
my $json = JSON->new;
my $catalogue;
if (-e $catname) {
    open(C, $catname);
    my $cattxt = <C>;
    close(C);
    $catalogue = from_json $cattxt;
} else {
    die "Can't open file $catname\n";
}

my @backup_epochs;

for (my $s = 0; $s <= $#src_names; $s++) {
    print "Gathering information on source ".$src_names[$s]."...\n";
    if (!defined $catalogue->{$src_names[$s]}) {
	print "  source not found.\n";
	next;
    }
    # Add all the epochs to the list required to backup.
    print "  epochs: ";
    for (my $i = 0; $i <= $#{$catalogue->{$src_names[$s]}->{'epochs'}}; $i++) {
	print $catalogue->{$src_names[$s]}->{'epochs'}->[$i]." ";
	&unique_add(\@backup_epochs, $catalogue->{$src_names[$s]}->{'epochs'}->[$i]);
    }
    print "\n";
}

# Backup the epochs.
print "\n";
for (my $i = 0; $i <= $#backup_epochs; $i++) {
    print "Backup epoch ".$backup_epochs[$i]."\n";
    my $odt = $od."/".$backup_epochs[$i];
    if (!-d $odt) {
	print "  Can't find the epoch ".$backup_epochs[$i]."\n";
    }

    # Make a backup of the epoch directory.
    print "  Backing up epoch directory to $odt.bak\n";
    print "  cp -r $odt $odt.bak\n";
    system "cp -r $odt $odt.bak";
}
print "\n";

# Now delete the sources.
for (my $s = 0; $s <= $#src_names; $s++) {
    print "Deleting source ".$src_names[$s]."...\n";
    delete $catalogue->{$src_names[$s]};
}

# Write the JSON out again.
print "Writing out the catalogue...\n";
open(C, ">".$catname);
print C to_json $catalogue;
close(C);


sub unique_add {
    my $aref = shift;
    my $nv = shift;

    my $f = 0;
    for (my $i = 0; $i <= $#{$aref}; $i++) {
	if ($aref->[$i] eq $nv) {
	    $f = 1;
	    last;
	}
    }
    if ($f == 0) {
	push @{$aref}, $nv;
    }
    
}
